package db

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// ApplySync applies rows from another device. server says which side
// gives way when two tasks have the same key (item 12): on the server the
// task arriving later is renumbered, on a device its own unsent task is.
func (d *DB) ApplySync(ctx context.Context, rows []SyncRow, server bool) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := syncMetaSet(ctx, tx, "applying", 1); err != nil {
		return err
	}
	order := map[string]int{}
	for i, t := range syncTables {
		order[t.name] = i
	}
	sort.SliceStable(rows, func(i, j int) bool { return order[rows[i].Table] < order[rows[j].Table] })

	a := &applier{ctx: ctx, tx: tx, server: server, tasks: map[int64]bool{}}
	for _, r := range rows {
		if err := a.row(r); err != nil {
			return fmt.Errorf("sync %s %s: %w", r.Table, r.UID, err)
		}
	}
	for _, p := range a.later {
		if id, ok := idOf(ctx, tx, "task", p.uid); ok {
			tx.ExecContext(ctx, `UPDATE task SET `+p.col+` = ? WHERE id = ?`, id, p.task)
		}
	}
	// A task's status is the one its latest transition went to (item 6).
	for id := range a.tasks {
		if _, err := tx.ExecContext(ctx, `UPDATE task SET status_id = (SELECT to_status_id FROM status_transition
			WHERE task_id = ?1 ORDER BY at DESC, id DESC LIMIT 1)
			WHERE id = ?1 AND EXISTS (SELECT 1 FROM status_transition WHERE task_id = ?1)`, id); err != nil {
			return err
		}
	}
	// The clock never runs behind one it has seen (a hybrid logical clock).
	if a.maxClock > syncMetaInt(ctx, tx, "clock") {
		if err := syncMetaSet(ctx, tx, "clock", a.maxClock); err != nil {
			return err
		}
	}
	if err := syncMetaSet(ctx, tx, "applying", 0); err != nil {
		return err
	}
	return tx.Commit()
}

type applier struct {
	ctx      context.Context
	tx       *sql.Tx
	server   bool
	maxClock int64
	tasks    map[int64]bool // tasks whose status may have moved
	later    []laterRef     // task references to tasks not yet seen
	// renumbered is set when an incoming task's key was changed here.
	renumbered string
}

type laterRef struct {
	task     int64
	col, uid string
}

func (a *applier) nextSeq() (int64, error) {
	if _, err := a.tx.ExecContext(a.ctx, `UPDATE sync_meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'seq'`); err != nil {
		return 0, err
	}
	return syncMetaInt(a.ctx, a.tx, "seq"), nil
}

func (a *applier) stamp(table, key, field string, s SyncStamp) error {
	seq, err := a.nextSeq()
	if err != nil {
		return err
	}
	_, err = a.tx.ExecContext(a.ctx, `INSERT INTO sync_field (tbl, key, field, clock, device, seq) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (tbl, key, field) DO UPDATE SET clock = excluded.clock, device = excluded.device, seq = excluded.seq`,
		table, key, field, s.Clock, s.Device, seq)
	return err
}

// stampHere marks a change made here while applying (a renumbered key), so
// it is sent on like any local change.
func (a *applier) stampHere(table, key, field string) error {
	if _, err := a.tx.ExecContext(a.ctx, `UPDATE sync_meta SET value = max(CAST(value AS INTEGER) + 1, ?) WHERE key = 'clock'`, a.maxClock+1); err != nil {
		return err
	}
	return a.stamp(table, key, field, SyncStamp{syncMetaInt(a.ctx, a.tx, "clock"), syncMetaGet(a.ctx, a.tx, "device")})
}

// local turns an incoming value back into what this database stores.
func (a *applier) local(t *syncTable, col string, v any) (any, bool) {
	if rt, isRef := t.refs[col]; isRef && v != nil {
		s, _ := v.(string)
		id, ok := idOf(a.ctx, a.tx, rt, s)
		if !ok {
			return nil, false
		}
		return id, true
	}
	if f, ok := v.(float64); ok && f == float64(int64(f)) {
		return int64(f), true
	}
	return swapJSONColumn(t.name, col, v, toID(a.ctx, a.tx)), true
}

func (a *applier) row(r SyncRow) error {
	t := syncTableNamed(r.Table)
	if t == nil || t.parent != "" || (r.Table == "setting" && syncPrivateSettings[r.UID]) {
		return nil
	}
	for _, s := range r.Stamps {
		if s.Clock > a.maxClock {
			a.maxClock = s.Clock
		}
	}
	keyCol, key := "id", r.UID
	exists := false
	if t.natural != "" {
		keyCol = t.natural
		var n int
		a.tx.QueryRowContext(a.ctx, `SELECT COUNT(*) FROM `+t.name+` WHERE `+keyCol+` = ?`, key).Scan(&n)
		exists = n > 0
	} else if id, ok := idOf(a.ctx, a.tx, t.name, r.UID); ok {
		key = strconv.FormatInt(id, 10)
		var n int
		a.tx.QueryRowContext(a.ctx, `SELECT COUNT(*) FROM `+t.name+` WHERE id = ?`, id).Scan(&n)
		exists = n > 0
		if !exists && t.natural == "" {
			// Known uid, row gone: deleted here, and a delete wins.
			return nil
		}
	}
	local, err := rowStamps(a.ctx, a.tx, t.name, key)
	if err != nil {
		return err
	}
	if _, gone := local["_deleted"]; gone {
		return nil
	}
	if del, gone := r.Stamps["_deleted"]; gone {
		if exists {
			// A row still referenced elsewhere stays; nothing else is lost.
			if _, err := a.tx.ExecContext(a.ctx, `DELETE FROM `+t.name+` WHERE `+keyCol+` = ?`, key); err != nil {
				return nil
			}
			return a.stamp(t.name, key, "_deleted", del)
		}
		return nil
	}
	if r.Values == nil {
		return nil
	}
	if !exists {
		return a.insert(t, r)
	}
	return a.update(t, r, key, local)
}

func (a *applier) insert(t *syncTable, r SyncRow) error {
	cols, err := tableColumns(a.ctx, a.tx, t.name)
	if err != nil {
		return err
	}
	var names []string
	var args []any
	var pend [][2]string // task references to tasks not yet seen
	for _, c := range cols {
		v, ok := r.Values[c]
		if !ok || c == "id" || t.skips(c) {
			continue
		}
		lv, ok := a.local(t, c, v)
		if !ok {
			if uid, isUID := v.(string); isUID && t.name == "task" && (c == "epic_id" || c == "parent_id") {
				pend = append(pend, [2]string{c, uid})
			}
			lv = nil
		}
		names = append(names, c)
		args = append(args, lv)
	}
	if t.natural != "" {
		names = append(names, t.natural)
		args = append(args, r.UID)
	}
	if t.name == "task" {
		if err := a.taskKey(names, args); err != nil {
			return err
		}
		// A new task starts in the default status until its transitions arrive.
		if st, err := defaultStatus(a.ctx, a.tx); err == nil {
			names = append(names, "status_id")
			args = append(args, st)
		}
	}
	ph := strings.TrimSuffix(strings.Repeat("?, ", len(names)), ", ")
	res, err := a.tx.ExecContext(a.ctx, `INSERT INTO `+t.name+` (`+strings.Join(names, ", ")+`) VALUES (`+ph+`)`, args...)
	if err != nil {
		return nil // e.g. a reference this device doesn't have; skipped, not fatal
	}
	key := r.UID
	if t.natural == "" {
		id, _ := res.LastInsertId()
		key = strconv.FormatInt(id, 10)
		if _, err := a.tx.ExecContext(a.ctx, `UPDATE sync_idmap SET uid = ? WHERE tbl = ? AND id = ?`, r.UID, t.name, id); err != nil {
			return err
		}
		for _, p := range pend {
			a.later = append(a.later, laterRef{id, p[0], p[1]})
		}
		switch t.name {
		case "task":
			a.tasks[id] = true
		case "status_transition":
			if tid, ok := r.Values["task_id"].(string); ok {
				if id, ok := idOf(a.ctx, a.tx, "task", tid); ok {
					a.tasks[id] = true
				}
			}
		}
	}
	if t.name == "session" {
		if err := a.sessionParts(key, r.Values); err != nil {
			return err
		}
	}
	for f, s := range r.Stamps {
		if err := a.stamp(t.name, key, f, s); err != nil {
			return err
		}
	}
	if a.renumbered != "" {
		a.renumbered = ""
		return a.stampHere("task", key, "key")
	}
	return nil
}

func (a *applier) update(t *syncTable, r SyncRow, key string, local map[string]SyncStamp) error {
	keyCol := "id"
	if t.natural != "" {
		keyCol = t.natural
	}
	var mine map[string]any // this row as it would be sent, read only if needed
	for c, v := range r.Values {
		if c == "id" || t.skips(c) {
			continue
		}
		rs, ls := fieldStamp(r.Stamps, c), fieldStamp(local, c)
		if !rs.after(ls) {
			if rs != ls {
				continue
			}
			// The same stamp (e.g. both never changed since before sync) with
			// different values: every device keeps the greater, so they agree.
			if mine == nil {
				own, _, err := exportRow(a.ctx, a.tx, t.name, key)
				if err != nil {
					return err
				}
				mine = own.Values
			}
			if fmt.Sprint(v) <= fmt.Sprint(mine[c]) {
				continue
			}
		}
		if c == "_energies" || c == "_subtypes" {
			if err := a.sessionParts(key, map[string]any{c: v}); err != nil {
				return err
			}
		} else {
			lv, ok := a.local(t, c, v)
			if !ok {
				lv = nil
			}
			if _, err := a.tx.ExecContext(a.ctx, `UPDATE `+t.name+` SET `+c+` = ? WHERE `+keyCol+` = ?`, lv, key); err != nil {
				continue // a column this version lacks, or a constraint: the rest still applies
			}
		}
		if err := a.stamp(t.name, key, c, rs); err != nil {
			return err
		}
	}
	return nil
}

// taskKey settles two tasks with one key (item 12). On the server the
// incoming task gets the next free number; on a device the device's own
// task does, and that change is sent with the next sync.
func (a *applier) taskKey(names []string, args []any) error {
	ki := -1
	for i, n := range names {
		if n == "key" {
			ki = i
		}
	}
	if ki < 0 {
		return nil
	}
	k, _ := args[ki].(string)
	var other int64
	if a.tx.QueryRowContext(a.ctx, `SELECT id FROM task WHERE key = ?`, k).Scan(&other) != nil {
		return nil
	}
	prefix := k
	if i := strings.LastIndex(k, "-"); i > 0 {
		prefix = k[:i]
	}
	next, err := nextKey(a.ctx, a.tx, prefix)
	if err != nil {
		return err
	}
	if a.server {
		args[ki] = next
		a.renumbered = next
		return nil
	}
	if _, err := a.tx.ExecContext(a.ctx, `UPDATE task SET key = ? WHERE id = ?`, next, other); err != nil {
		return err
	}
	return a.stampHere("task", strconv.FormatInt(other, 10), "key")
}

// sessionParts replaces a session's energy types or subtypes from incoming values.
func (a *applier) sessionParts(key string, vals map[string]any) error {
	if list, ok := vals["_energies"].([]any); ok {
		if _, err := a.tx.ExecContext(a.ctx, `DELETE FROM session_energy WHERE session_id = ?`, key); err != nil {
			return err
		}
		for _, x := range list {
			p, _ := x.([]any)
			if len(p) < 5 {
				continue
			}
			uid, _ := p[0].(string)
			et, ok := idOf(a.ctx, a.tx, "energy_type", uid)
			if !ok {
				continue
			}
			if _, err := a.tx.ExecContext(a.ctx, `INSERT INTO session_energy (session_id, energy_type_id, share, difficulty, points, position)
				VALUES (?, ?, ?, ?, ?, ?)`, key, et, p[1], p[2], p[3], p[4]); err != nil {
				return err
			}
		}
	}
	if list, ok := vals["_subtypes"].([]any); ok {
		if _, err := a.tx.ExecContext(a.ctx, `DELETE FROM session_subtype WHERE session_id = ?`, key); err != nil {
			return err
		}
		for _, x := range list {
			p, _ := x.([]any)
			if len(p) < 2 {
				continue
			}
			uid, _ := p[0].(string)
			st, ok := idOf(a.ctx, a.tx, "subtype", uid)
			if !ok {
				continue
			}
			if _, err := a.tx.ExecContext(a.ctx, `INSERT INTO session_subtype (session_id, subtype_id, rank) VALUES (?, ?, ?)`, key, st, p[1]); err != nil {
				return err
			}
		}
	}
	return nil
}
