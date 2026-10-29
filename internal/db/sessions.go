package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Session is logged time: work against a task (kind 'task') or something
// that happened that is not work (kind 'event').
type Session struct {
	ID           int64            `json:"id"`
	TaskID       *int64           `json:"task_id"`
	Label        *string          `json:"label"`
	AreaID       *int64           `json:"area_id"`
	Kind         string           `json:"kind"`
	EnergyTypeID int64            `json:"energy_type_id"`
	Hours        float64          `json:"hours"`
	Difficulty   *int64           `json:"difficulty"`
	StartedAt    *string          `json:"started_at"`
	LoggedFor    string           `json:"logged_for"`
	Note         *string          `json:"note"`
	Custom       json.RawMessage  `json:"custom"`
	CreatedAt    string           `json:"created_at"`
	Subtypes     []SessionSubtype `json:"subtypes"`
}

// SessionSubtype is one ranked subtype with its derived weight and hours.
type SessionSubtype struct {
	SubtypeID int64   `json:"subtype_id"`
	Rank      int     `json:"rank"`
	Weight    float64 `json:"weight"`     // from the subtype_weights setting
	WeightedH float64 `json:"weighted_h"` // session hours x weight
}

const sessionCols = `id, task_id, label, area_id, kind, energy_type_id, hours, difficulty,
	started_at, logged_for, note, custom, created_at`

func scanSession(r interface{ Scan(...any) error }) (*Session, error) {
	var s Session
	var custom string
	err := r.Scan(&s.ID, &s.TaskID, &s.Label, &s.AreaID, &s.Kind, &s.EnergyTypeID, &s.Hours, &s.Difficulty,
		&s.StartedAt, &s.LoggedFor, &s.Note, &custom, &s.CreatedAt)
	s.Custom = json.RawMessage(custom)
	return &s, err
}

var sessionColumns = columns{
	"task_id":        kIntNull,
	"label":          kTextNull,
	"area_id":        kIntNull,
	"kind":           kText,
	"energy_type_id": kInt,
	"hours":          kReal,
	"difficulty":     kIntNull,
	"started_at":     kTextNull,
	"logged_for":     kText,
	"note":           kTextNull,
}

// defaultSubtypeWeights is used when the setting is missing or malformed.
var defaultSubtypeWeights = []float64{1.0, 0.5, 0.25, 0.25}

// rankWeight maps a subtype rank (1-based) to its weight. Ranks past the
// end of the list take the last weight.
func rankWeight(weights []float64, rank int) float64 {
	if len(weights) == 0 {
		weights = defaultSubtypeWeights
	}
	if rank < 1 {
		return 0
	}
	if rank > len(weights) {
		return weights[len(weights)-1]
	}
	return weights[rank-1]
}

func (d *DB) subtypeWeights(ctx context.Context) []float64 {
	var w []float64
	if ok, err := d.Setting(ctx, "subtype_weights", &w); !ok || err != nil || len(w) == 0 {
		return defaultSubtypeWeights
	}
	return w
}

func validateSessionFields(f Fields) error {
	if raw, ok := f["hours"]; ok {
		var h float64
		if json.Unmarshal(raw, &h) != nil || h <= 0 || h > 24 {
			return invalid("hours must be more than 0 and at most 24")
		}
	}
	if raw, ok := f["difficulty"]; ok && !isNull(raw) {
		var n int64
		if json.Unmarshal(raw, &n) != nil || !validDifficulty(n) {
			return invalid("difficulty must be a whole number from 1 to 5")
		}
	}
	if s, ok, err := f.stringField("logged_for"); err != nil {
		return err
	} else if ok && !validDate(s) {
		return invalid("logged_for must be YYYY-MM-DD")
	}
	if s, ok, err := f.stringField("started_at"); err != nil {
		return err
	} else if ok && s != "" {
		t, err := ParseTime(s)
		if err != nil {
			return invalid("started_at must be an ISO-8601 timestamp")
		}
		f["started_at"], _ = json.Marshal(FormatTime(t))
	}
	if s, ok, err := f.stringField("kind"); err != nil {
		return err
	} else if ok && s != "task" && s != "event" {
		return invalid("kind must be task or event")
	}
	return nil
}

// resolveSessionDefaults fills area and energy type by the spec's chain:
// a session with a task inherits the task's energy type (and area); without
// a task it takes the area's default. Values the caller sent always win.
func resolveSessionDefaults(ctx context.Context, q querier, f Fields) error {
	if taskID, ok, err := f.int64Field("task_id"); err != nil {
		return err
	} else if ok {
		var areaID int64
		var energy sql.NullInt64
		err := q.QueryRowContext(ctx, `SELECT area_id, energy_type_id FROM task WHERE id = ? AND deleted_at IS NULL`, taskID).
			Scan(&areaID, &energy)
		if err == sql.ErrNoRows {
			return invalid("task %d does not exist", taskID)
		}
		if err != nil {
			return err
		}
		if _, set := f["area_id"]; !set {
			f["area_id"], _ = json.Marshal(areaID)
		}
		if _, set := f["energy_type_id"]; !set && energy.Valid {
			f["energy_type_id"], _ = json.Marshal(energy.Int64)
		}
	}
	if _, set := f["energy_type_id"]; !set {
		if areaID, ok, err := f.int64Field("area_id"); err != nil {
			return err
		} else if ok {
			var energy sql.NullInt64
			q.QueryRowContext(ctx, `SELECT default_energy_type_id FROM area WHERE id = ?`, areaID).Scan(&energy)
			if energy.Valid {
				f["energy_type_id"], _ = json.Marshal(energy.Int64)
			}
		}
	}
	if _, set := f["energy_type_id"]; !set {
		return invalid("energy_type_id is required (no task or area default to take it from)")
	}
	return nil
}

// parseSubtypes reads the "subtypes" field: subtype ids in rank order.
func parseSubtypes(f Fields) (ids []int64, present bool, err error) {
	raw, ok := f["subtypes"]
	delete(f, "subtypes")
	if !ok {
		return nil, false, nil
	}
	if isNull(raw) {
		return nil, true, nil
	}
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil, true, invalid("subtypes must be a list of subtype ids in rank order")
	}
	if len(ids) > 4 {
		return nil, true, invalid("at most 4 subtypes")
	}
	seen := map[int64]bool{}
	for _, id := range ids {
		if seen[id] {
			return nil, true, invalid("subtype %d listed twice", id)
		}
		seen[id] = true
	}
	return ids, true, nil
}

func writeSubtypes(ctx context.Context, tx *sql.Tx, sessionID int64, ids []int64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM session_subtype WHERE session_id = ?`, sessionID); err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx, `INSERT INTO session_subtype (session_id, subtype_id, rank) VALUES (?, ?, ?)`,
			sessionID, id, i+1); err != nil {
			return uniqueAsConflict(err, "bad subtype")
		}
	}
	return nil
}

func (d *DB) CreateSession(ctx context.Context, f Fields) (*Session, error) {
	subtypes, _, err := parseSubtypes(f)
	if err != nil {
		return nil, err
	}
	customPatch, hasCustom := f["custom"]
	delete(f, "custom")
	if _, ok := f["kind"]; !ok {
		f["kind"] = json.RawMessage(`"task"`)
	}
	for _, req := range []string{"hours", "logged_for"} {
		if _, ok := f[req]; !ok {
			return nil, invalid("%s is required", req)
		}
	}
	if err := validateSessionFields(f); err != nil {
		return nil, err
	}

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := resolveSessionDefaults(ctx, tx, f); err != nil {
		return nil, err
	}
	custom := "{}"
	if hasCustom {
		if custom, err = d.mergeCustom(ctx, tx, "session", "{}", customPatch); err != nil {
			return nil, err
		}
	}
	cols, vals, err := f.decode(sessionColumns)
	if err != nil {
		return nil, err
	}
	cols = append(cols, "custom", "created_at")
	vals = append(vals, custom, Now())
	res, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO session (%s) VALUES (%s)`,
		strings.Join(cols, ","), placeholders(len(cols))), vals...)
	if err != nil {
		return nil, uniqueAsConflict(err, "conflict")
	}
	id, _ := res.LastInsertId()
	if err := writeSubtypes(ctx, tx, id, subtypes); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetSession(ctx, id)
}

// PatchSession updates a session. The session table has no updated_at, so
// edits are last-write-wins (see docs/deviations.md).
func (d *DB) PatchSession(ctx context.Context, id int64, f Fields) (*Session, error) {
	subtypes, hasSubtypes, err := parseSubtypes(f)
	if err != nil {
		return nil, err
	}
	customPatch, hasCustom := f["custom"]
	delete(f, "custom")
	delete(f, "updated_at") // tolerated from clients that send it everywhere
	if err := validateSessionFields(f); err != nil {
		return nil, err
	}
	cols, vals, err := f.decode(sessionColumns)
	if err != nil {
		return nil, err
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	cur, err := scanSession(tx.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM session WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if hasCustom {
		merged, err := d.mergeCustom(ctx, tx, "session", string(cur.Custom), customPatch)
		if err != nil {
			return nil, err
		}
		cols, vals = append(cols, "custom"), append(vals, merged)
	}
	if len(cols) > 0 {
		sets := make([]string, len(cols))
		for i, c := range cols {
			sets[i] = c + " = ?"
		}
		if _, err := tx.ExecContext(ctx, `UPDATE session SET `+strings.Join(sets, ", ")+` WHERE id = ?`,
			append(vals, id)...); err != nil {
			return nil, uniqueAsConflict(err, "conflict")
		}
	}
	if hasSubtypes {
		if err := writeSubtypes(ctx, tx, id, subtypes); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetSession(ctx, id)
}

func (d *DB) DeleteSession(ctx context.Context, id int64) error {
	return d.softDelete(ctx, "session", id)
}

func (d *DB) GetSession(ctx context.Context, id int64) (*Session, error) {
	s, err := scanSession(d.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM session WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return s, d.attachSubtypes(ctx, []*Session{s})
}

// SessionQuery narrows ListSessions. Zero values mean no constraint.
type SessionQuery struct {
	From, To string // logged_for range, inclusive, YYYY-MM-DD
	TaskID   int64
}

func (d *DB) ListSessions(ctx context.Context, q SessionQuery) ([]*Session, error) {
	where := []string{"deleted_at IS NULL"}
	var args []any
	if q.From != "" {
		where, args = append(where, "logged_for >= ?"), append(args, q.From)
	}
	if q.To != "" {
		where, args = append(where, "logged_for <= ?"), append(args, q.To)
	}
	if q.TaskID != 0 {
		where, args = append(where, "task_id = ?"), append(args, q.TaskID)
	}
	sessions, err := collect(ctx, d, `SELECT `+sessionCols+` FROM session WHERE `+strings.Join(where, " AND ")+
		` ORDER BY logged_for DESC, created_at DESC`, func(r *sql.Rows) (*Session, error) { return scanSession(r) }, args...)
	if err != nil {
		return nil, err
	}
	return sessions, d.attachSubtypes(ctx, sessions)
}

// attachSubtypes loads ranked subtypes and derives their weights.
func (d *DB) attachSubtypes(ctx context.Context, sessions []*Session) error {
	if len(sessions) == 0 {
		return nil
	}
	byID := map[int64]*Session{}
	ids := make([]any, len(sessions))
	for i, s := range sessions {
		s.Subtypes = []SessionSubtype{}
		byID[s.ID] = s
		ids[i] = s.ID
	}
	weights := d.subtypeWeights(ctx)
	return scanInto(ctx, d, fmt.Sprintf(`SELECT session_id, subtype_id, rank FROM session_subtype
		WHERE session_id IN (%s) ORDER BY session_id, rank`, placeholders(len(ids))), func(r *sql.Rows) error {
		var sid int64
		var st SessionSubtype
		if err := r.Scan(&sid, &st.SubtypeID, &st.Rank); err != nil {
			return err
		}
		s := byID[sid]
		st.Weight = rankWeight(weights, st.Rank)
		st.WeightedH = s.Hours * st.Weight
		s.Subtypes = append(s.Subtypes, st)
		return nil
	}, ids...)
}
