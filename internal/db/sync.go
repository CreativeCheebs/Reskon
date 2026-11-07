package db

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
)

// Sync (Change 003). A change travels as the whole row plus, per field,
// when it last changed. The receiver keeps, field by field, whichever
// change is later: clock first, then device id, so every device picks the
// same winner. A tombstone (_deleted) beats everything.

// SyncStamp says when a field last changed and on which device.
type SyncStamp struct {
	Clock  int64  `json:"c"`
	Device string `json:"d"`
}

func (a SyncStamp) after(b SyncStamp) bool {
	if a.Clock != b.Clock {
		return a.Clock > b.Clock
	}
	return a.Device > b.Device
}

// SyncRow is one row on its way between devices. References are uids.
type SyncRow struct {
	Table  string               `json:"t"`
	UID    string               `json:"u"`
	Values map[string]any       `json:"v,omitempty"`
	Stamps map[string]SyncStamp `json:"s,omitempty"`
}

type txq interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func syncMetaGet(ctx context.Context, q txq, key string) string {
	var v string
	_ = q.QueryRowContext(ctx, `SELECT value FROM sync_meta WHERE key = ?`, key).Scan(&v) // no row: the empty string
	return v
}

func syncMetaInt(ctx context.Context, q txq, key string) int64 {
	n, _ := strconv.ParseInt(syncMetaGet(ctx, q, key), 10, 64)
	return n
}

func syncMetaSet(ctx context.Context, q txq, key string, v any) error {
	_, err := q.ExecContext(ctx, `UPDATE sync_meta SET value = ? WHERE key = ?`, fmt.Sprint(v), key)
	return err
}

// SyncState is this database's device id, the server seq it has seen and
// the last local seq the server has.
func (d *DB) SyncState(ctx context.Context) (device string, token, pushed, seq int64) {
	return syncMetaGet(ctx, d, "device"), syncMetaInt(ctx, d, "token"), syncMetaInt(ctx, d, "pushed"), syncMetaInt(ctx, d, "seq")
}

// StartSync moves seq off 0, which means "never synced": a database with
// no change since migration 016 would otherwise send a full copy each time.
func (d *DB) StartSync(ctx context.Context) error {
	_, err := d.ExecContext(ctx, `UPDATE sync_meta SET value = '1' WHERE key = 'seq' AND value = '0'`)
	return err
}

// SetSyncProgress records a finished sync on a device.
func (d *DB) SetSyncProgress(ctx context.Context, token, pushed int64) error {
	if err := syncMetaSet(ctx, d, "token", token); err != nil {
		return err
	}
	return syncMetaSet(ctx, d, "pushed", pushed)
}

func uidOf(ctx context.Context, q txq, table string, id int64) (string, bool) {
	var uid string
	err := q.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = ? AND id = ?`, table, id).Scan(&uid)
	return uid, err == nil
}

func idOf(ctx context.Context, q txq, table, uid string) (int64, bool) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT id FROM sync_idmap WHERE tbl = ? AND uid = ?`, table, uid).Scan(&id)
	return id, err == nil
}

func toUID(ctx context.Context, q txq) idSwap {
	return func(table, s string) (string, bool) {
		id, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return "", false
		}
		return uidOf(ctx, q, table, id)
	}
}

func toID(ctx context.Context, q txq) idSwap {
	return func(table, s string) (string, bool) {
		id, ok := idOf(ctx, q, table, s)
		return strconv.FormatInt(id, 10), ok
	}
}

func rowStamps(ctx context.Context, q txq, table, key string) (map[string]SyncStamp, error) {
	rows, err := q.QueryContext(ctx, `SELECT field, clock, device FROM sync_field WHERE tbl = ? AND key = ?`, table, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]SyncStamp{}
	for rows.Next() {
		var f string
		var s SyncStamp
		if err := rows.Scan(&f, &s.Clock, &s.Device); err != nil {
			return nil, err
		}
		out[f] = s
	}
	return out, rows.Err()
}

// fieldStamp is when a field last changed: its own stamp, or else the row's.
func fieldStamp(st map[string]SyncStamp, field string) SyncStamp {
	if s, ok := st[field]; ok {
		return s
	}
	return st["_row"]
}

// ExportSync gives the rows to send. all = every row (a full copy); else
// the rows with a field changed after seq since, made on device only (if
// set) and not on device except (if set). seq is where this export ends.
func (d *DB) ExportSync(ctx context.Context, since int64, only, except string, all bool) (rows []SyncRow, seq int64, err error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()
	seq = syncMetaInt(ctx, tx, "seq")
	type ref struct{ table, key string }
	var refs []ref
	seen := map[ref]bool{}
	add := func(r ref) {
		if !seen[r] {
			seen[r] = true
			refs = append(refs, r)
		}
	}
	if all {
		for _, t := range syncTables {
			if t.parent != "" {
				continue
			}
			col := "id"
			if t.natural != "" {
				col = t.natural
			}
			keys, err := queryStrings(ctx, tx, `SELECT CAST(`+col+` AS TEXT) FROM `+t.name)
			if err != nil {
				return nil, 0, err
			}
			for _, k := range keys {
				add(ref{t.name, k})
			}
		}
	}
	q := `SELECT DISTINCT tbl, key FROM sync_field WHERE seq > ?`
	args := []any{since}
	if all {
		q, args = `SELECT DISTINCT tbl, key FROM sync_field WHERE field = '_deleted'`, nil
	}
	if only != "" {
		q += ` AND device = ?`
		args = append(args, only)
	}
	if except != "" {
		q += ` AND device <> ?`
		args = append(args, except)
	}
	rs, err := tx.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	for rs.Next() {
		var r ref
		if err := rs.Scan(&r.table, &r.key); err != nil {
			rs.Close()
			return nil, 0, err
		}
		add(r)
	}
	rs.Close()
	for _, r := range refs {
		row, ok, err := exportRow(ctx, tx, r.table, r.key)
		if err != nil {
			return nil, 0, err
		}
		if ok {
			rows = append(rows, row)
		}
	}
	return rows, seq, nil
}

func queryStrings(ctx context.Context, q txq, query string, args ...any) ([]string, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// selectMap reads one row as column -> value.
func selectMap(ctx context.Context, q txq, query string, args ...any) (map[string]any, bool, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	cols, _ := rows.Columns()
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, false, err
	}
	m := map[string]any{}
	for i, c := range cols {
		if b, ok := vals[i].([]byte); ok {
			vals[i] = string(b)
		}
		m[c] = vals[i]
	}
	return m, true, nil
}

func exportRow(ctx context.Context, q txq, table, key string) (SyncRow, bool, error) {
	t := syncTableNamed(table)
	if t == nil || t.parent != "" || (table == "setting" && syncPrivateSettings[key]) {
		return SyncRow{}, false, nil
	}
	row := SyncRow{Table: table, UID: key}
	if t.natural == "" {
		id, _ := strconv.ParseInt(key, 10, 64)
		uid, ok := uidOf(ctx, q, table, id)
		if !ok {
			return row, false, nil
		}
		row.UID = uid
	}
	st, err := rowStamps(ctx, q, table, key)
	if err != nil {
		return row, false, err
	}
	row.Stamps = st
	if _, gone := st["_deleted"]; gone {
		return row, true, nil
	}
	keyCol := "id"
	if t.natural != "" {
		keyCol = t.natural
	}
	vals, ok, err := selectMap(ctx, q, `SELECT * FROM `+table+` WHERE `+keyCol+` = ?`, key)
	if err != nil || !ok {
		return row, false, err
	}
	swap := toUID(ctx, q)
	row.Values = map[string]any{}
	for c, v := range vals {
		if c == "id" || c == t.natural || t.skips(c) {
			continue
		}
		if rt, isRef := t.refs[c]; isRef && v != nil {
			uid, ok := uidOf(ctx, q, rt, v.(int64))
			if !ok {
				continue
			}
			v = uid
		}
		row.Values[c] = swapJSONColumn(table, c, v, swap)
	}
	if table == "session" {
		if row.Values["_energies"], err = sessionParts(ctx, q, key, `SELECT energy_type_id, share, difficulty, points, position FROM session_energy WHERE session_id = ?`, "energy_type"); err != nil {
			return row, false, err
		}
		if row.Values["_subtypes"], err = sessionParts(ctx, q, key, `SELECT subtype_id, rank FROM session_subtype WHERE session_id = ?`, "subtype"); err != nil {
			return row, false, err
		}
	}
	return row, true, nil
}

// sessionParts reads a session's child rows; the first column is a reference.
func sessionParts(ctx context.Context, q txq, sessionID, query, refTable string) ([]any, error) {
	rows, err := q.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		uid, ok := uidOf(ctx, q, refTable, vals[0].(int64))
		if !ok {
			continue
		}
		vals[0] = uid
		out = append(out, vals)
	}
	return out, rows.Err()
}
