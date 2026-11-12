package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Task is a task row plus its derived values. Derived values are computed on
// read (see derive.go) and never stored.
type Task struct {
	ID                   int64           `json:"id"`
	Key                  string          `json:"key"`
	Title                string          `json:"title"`
	Description          *string         `json:"description"`
	AreaID               int64           `json:"area_id"`
	StatusID             int64           `json:"status_id"`
	PriorityID           *int64          `json:"priority_id"`
	EnergyTypeID         *int64          `json:"energy_type_id"`
	Difficulty           *int64          `json:"difficulty"`
	EstimateH            *float64        `json:"estimate_h"`
	DueAt                *string         `json:"due_at"`
	StartDate            *string         `json:"start_date"` // set by hand or by a move (see taskdates.go)
	EndDate              *string         `json:"end_date"`
	SnoozedUntil         *string         `json:"snoozed_until"`          // hidden until this local date; set only by Snooze (see snooze.go)
	Type                 string          `json:"type"`                   // "task" or "epic"
	EpicID               *int64          `json:"epic_id"`                // the epic this task belongs to
	ParentID             *int64          `json:"parent_id"`              // set on a subtask: the task it belongs to (see subtasks.go)
	SnoozeUntilUnblocked bool            `json:"snooze_until_unblocked"` // hidden while an open task blocks it; set only by Snooze (see links.go)
	BoardPos             float64         `json:"board_pos"`
	TagIDs               []int64         `json:"tag_ids"` // derived: its tags, by name (see tags.go)
	Custom               json.RawMessage `json:"custom"`
	CreatedAt            string          `json:"created_at"`
	UpdatedAt            string          `json:"updated_at"`
	TaskDerived
}

const taskCols = `id, key, title, description, area_id, status_id, priority_id, energy_type_id,
	difficulty, estimate_h, due_at, board_pos, custom, created_at, updated_at, type, epic_id, start_date, end_date, snoozed_until, parent_id, snooze_until_unblocked`

func scanTask(r interface{ Scan(...any) error }) (*Task, error) {
	var t Task
	var custom string
	err := r.Scan(&t.ID, &t.Key, &t.Title, &t.Description, &t.AreaID, &t.StatusID, &t.PriorityID,
		&t.EnergyTypeID, &t.Difficulty, &t.EstimateH, &t.DueAt, &t.BoardPos, &custom, &t.CreatedAt, &t.UpdatedAt,
		&t.Type, &t.EpicID, &t.StartDate, &t.EndDate, &t.SnoozedUntil, &t.ParentID, &t.SnoozeUntilUnblocked)
	t.Custom = json.RawMessage(custom)
	return &t, err
}

// Columns a client may set directly. status_id is absent on purpose: status
// only changes through Move, which writes the transition row.
var taskColumns = columns{
	"title":          kText,
	"description":    kTextNull,
	"area_id":        kInt,
	"priority_id":    kIntNull,
	"energy_type_id": kIntNull,
	"difficulty":     kIntNull,
	"estimate_h":     kRealNull,
	"due_at":         kTextNull,
	"start_date":     kTextNull,
	"end_date":       kTextNull,
	"type":           kText,
	"epic_id":        kIntNull,
	"parent_id":      kIntNull,
}

// validateTaskFields checks the rules that column types alone cannot express.
func validateTaskFields(f Fields) error {
	if raw, ok := f["difficulty"]; ok && !isNull(raw) {
		var n int64
		if json.Unmarshal(raw, &n) != nil || !validDifficulty(n) {
			return invalid("difficulty must be a whole number from 1 to 5")
		}
	}
	if raw, ok := f["estimate_h"]; ok && !isNull(raw) {
		var x float64
		if json.Unmarshal(raw, &x) != nil || x < 0 {
			return invalid("estimate_h must be a non-negative number")
		}
	}
	if s, ok, err := f.stringField("due_at"); err != nil {
		return err
	} else if ok && s != "" && !validDate(s) {
		return invalid("due_at must be YYYY-MM-DD")
	}
	for _, k := range []string{"start_date", "end_date"} {
		if s, ok, err := f.stringField(k); err != nil {
			return err
		} else if ok && s != "" && !validDate(s) {
			return invalid("%s must be YYYY-MM-DD", k)
		}
	}
	return nil
}

// validDifficulty: difficulty is a 1-5 scale (1 easiest).
func validDifficulty(n int64) bool {
	return n >= 1 && n <= 5
}

func validDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func (d *DB) GetTask(ctx context.Context, id int64) (*Task, error) {
	t, err := d.getTask(ctx, d, id)
	if err != nil {
		return nil, err
	}
	if err := d.derive(ctx, []*Task{t}, d.Now(ctx)); err != nil {
		return nil, err
	}
	return t, nil
}

func (d *DB) getTask(ctx context.Context, q querier, id int64) (*Task, error) {
	t, err := scanTask(q.QueryRowContext(ctx, `SELECT `+taskCols+` FROM task WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return t, err
}

// CreateTask inserts a task, assigns its key and writes the creation
// transition, all in one transaction.
//
// Defaults: status is the first on-board status in a todo category;
// energy type is the area's default.
func (d *DB) CreateTask(ctx context.Context, f Fields) (*Task, error) {
	if _, ok := f["title"]; !ok {
		return nil, invalid("title is required")
	}
	areaID, ok, err := f.int64Field("area_id")
	if err != nil {
		return nil, err
	}
	if !ok {
		// A subtask without an area takes its parent's.
		if areaID, ok, err = d.parentArea(ctx, f); err != nil {
			return nil, err
		} else if ok {
			f["area_id"], _ = json.Marshal(areaID)
		}
	}
	if !ok {
		return nil, invalid("area_id is required")
	}
	statusID, hasStatus, err := f.int64Field("status_id")
	if err != nil {
		return nil, err
	}
	delete(f, "status_id")
	today := localDate(f)
	customPatch, hasCustom := f["custom"]
	delete(f, "custom")
	tagNames, hasTags, err := parseTags(f)
	if err != nil {
		return nil, err
	}
	if err := validateTaskFields(f); err != nil {
		return nil, err
	}

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var prefix string
	var defaultEnergy sql.NullInt64
	err = tx.QueryRowContext(ctx, `SELECT key_prefix, default_energy_type_id FROM area
		WHERE id = ? AND deleted_at IS NULL`, areaID).Scan(&prefix, &defaultEnergy)
	if err == sql.ErrNoRows {
		return nil, invalid("area %d does not exist", areaID)
	}
	if err != nil {
		return nil, err
	}
	if _, set := f["energy_type_id"]; !set && defaultEnergy.Valid {
		f["energy_type_id"], _ = json.Marshal(defaultEnergy.Int64)
	}
	if !hasStatus {
		if statusID, err = defaultStatus(ctx, tx); err != nil {
			return nil, err
		}
	} else if err := statusExists(ctx, tx, statusID); err != nil {
		return nil, err
	}

	if err := checkParentFields(ctx, tx, 0, "task", nil, f); err != nil {
		return nil, err
	}
	if err := checkEpicFields(ctx, tx, 0, "task", nil, f); err != nil {
		return nil, err
	}
	custom := "{}"
	if hasCustom {
		if custom, err = d.mergeCustom(ctx, tx, "task", "{}", customPatch); err != nil {
			return nil, err
		}
	}

	key, err := nextKey(ctx, tx, prefix)
	if err != nil {
		return nil, err
	}
	pos, err := endOfColumn(ctx, tx, statusID)
	if err != nil {
		return nil, err
	}

	cols, vals, err := f.decode(taskColumns)
	if err != nil {
		return nil, err
	}
	now := Now()
	cols = append(cols, "key", "status_id", "board_pos", "custom", "created_at", "updated_at")
	vals = append(vals, key, statusID, pos, custom, now, now)
	res, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO task (%s) VALUES (%s)`,
		strings.Join(cols, ","), placeholders(len(cols))), vals...)
	if err != nil {
		return nil, uniqueAsConflict(err, "task key collision")
	}
	id, _ := res.LastInsertId()
	if hasTags {
		if err := setTaskTags(ctx, tx, id, tagNames); err != nil {
			return nil, err
		}
	}
	if err := writeTransition(ctx, tx, id, nil, statusID, "user", now); err != nil {
		return nil, err
	}
	// A task created straight into In progress (say) gets its start date.
	if err := applyDateRules(ctx, tx, id, statusID, today); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetTask(ctx, id)
}

// nextKey returns PREFIX-N where N is one more than the highest number ever
// used with that prefix. Deleted tasks count, so keys are never reused.
// Must run inside the write transaction that inserts the task.
func nextKey(ctx context.Context, tx *sql.Tx, prefix string) (string, error) {
	var max sql.NullInt64
	err := tx.QueryRowContext(ctx, `SELECT MAX(CAST(substr(key, ?) AS INTEGER)) FROM task WHERE key LIKE ?`,
		len(prefix)+2, prefix+"-%").Scan(&max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%d", prefix, max.Int64+1), nil
}

// defaultStatus is the first on-board status whose category behaves as todo.
func defaultStatus(ctx context.Context, q querier) (int64, error) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT s.id FROM status s
		JOIN status_category c ON c.id = s.category_id
		WHERE s.deleted_at IS NULL AND s.on_board = 1 AND c.behaviour = 'todo'
		ORDER BY s.position, s.id LIMIT 1`).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, invalid("no on-board status in a todo category exists")
	}
	return id, err
}

func statusExists(ctx context.Context, q querier, id int64) error {
	var one int
	if err := q.QueryRowContext(ctx, `SELECT 1 FROM status WHERE id = ? AND deleted_at IS NULL`, id).Scan(&one); err != nil {
		return invalid("status %d does not exist", id)
	}
	return nil
}

// PatchTask updates the given fields. f must carry the updated_at the client
// last saw; if the row has moved since, it returns a ConflictError holding
// the current row and changes nothing.
func (d *DB) PatchTask(ctx context.Context, id int64, f Fields) (*Task, error) {
	seen, ok, err := f.stringField("updated_at")
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, invalid("updated_at is required")
	}
	delete(f, "updated_at")
	if _, ok := f["status_id"]; ok {
		return nil, invalid("status_id changes go through POST /api/tasks/:id/move")
	}
	customPatch, hasCustom := f["custom"]
	delete(f, "custom")
	tagNames, hasTags, err := parseTags(f)
	if err != nil {
		return nil, err
	}
	if err := validateTaskFields(f); err != nil {
		return nil, err
	}
	if _, _, err := f.decode(taskColumns); err != nil { // reject bad fields before touching the database
		return nil, err
	}

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	cur, err := d.getTask(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if cur.UpdatedAt != seen {
		tx.Rollback()
		current, err := d.GetTask(ctx, id)
		if err != nil {
			return nil, err
		}
		return nil, &ConflictError{Msg: "task changed since you loaded it", Current: current}
	}
	if err := checkParentFields(ctx, tx, id, cur.Type, cur.ParentID, f); err != nil {
		return nil, err
	}
	if err := checkEpicFields(ctx, tx, id, cur.Type, cur.EpicID, f); err != nil {
		return nil, err
	}
	// The checks above may have changed f (a subtask takes its parent's epic,
	// an epic leaves its old one), so the columns are read again.
	cols, vals, err := f.decode(taskColumns)
	if err != nil {
		return nil, err
	}
	if hasCustom {
		merged, err := d.mergeCustom(ctx, tx, "task", string(cur.Custom), customPatch)
		if err != nil {
			return nil, err
		}
		cols, vals = append(cols, "custom"), append(vals, merged)
	}
	if hasTags {
		if err := setTaskTags(ctx, tx, id, tagNames); err != nil {
			return nil, err
		}
	}
	cols, vals = append(cols, "updated_at"), append(vals, Now())
	sets := make([]string, len(cols))
	for i, c := range cols {
		sets[i] = c + " = ?"
	}
	vals = append(vals, id)
	if _, err := tx.ExecContext(ctx, `UPDATE task SET `+strings.Join(sets, ", ")+` WHERE id = ?`, vals...); err != nil {
		return nil, uniqueAsConflict(err, "conflict")
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetTask(ctx, id)
}

// DeleteTask soft-deletes a task, keeping its subtasks as ordinary tasks.
func (d *DB) DeleteTask(ctx context.Context, id int64) error {
	return d.DeleteTaskWith(ctx, id, false)
}

// DeleteTaskWith soft-deletes a task. Its key stays reserved. If it is an
// epic, its tasks stay and simply lose the epic. Its subtasks are deleted
// with it when withSubtasks is set; otherwise they stay, as ordinary tasks.
func (d *DB) DeleteTaskWith(ctx context.Context, id int64, withSubtasks bool) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		if err := deleteTaskTx(ctx, tx, id, withSubtasks, Now()); err != nil {
			return err
		}
		// A deleted task blocks nothing.
		return releaseUnblocked(ctx, tx)
	})
}

// DeleteTasks soft-deletes several tasks in one go, from the table's
// selection: all of them or none, at most 1000. A task that is already gone,
// or an id that is not a task, fails the whole call and nothing is deleted.
// Each task is handled as DeleteTaskWith handles it, so an epic's tasks stay
// without the epic. An id given twice counts once, and so does a subtask
// that is selected together with its parent when subtasks go with it. It
// returns how many different tasks were chosen.
func (d *DB) DeleteTasks(ctx context.Context, ids []int64, withSubtasks bool) (int, error) {
	if len(ids) == 0 {
		return 0, invalid("choose at least one task")
	}
	if len(ids) > maxBulkTasks {
		return 0, invalid("at most %d tasks at a time", maxBulkTasks)
	}
	now := Now()
	unique := make([]int64, 0, len(ids))
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		// Every id must be a live task before anything is changed.
		for _, id := range unique {
			var one int
			err := tx.QueryRowContext(ctx, `SELECT 1 FROM task WHERE id = ? AND deleted_at IS NULL`, id).Scan(&one)
			if err == sql.ErrNoRows {
				return ErrNotFound
			}
			if err != nil {
				return err
			}
		}
		for _, id := range unique {
			// A subtask already deleted with its parent earlier in this batch is done.
			if err := deleteTaskTx(ctx, tx, id, withSubtasks, now); err != nil && !errors.Is(err, ErrNotFound) {
				return err
			}
		}
		return releaseUnblocked(ctx, tx)
	})
	if err != nil {
		return 0, err
	}
	return len(unique), nil
}

// The most tasks one bulk move or delete may name.
const maxBulkTasks = 1000

func deleteTaskTx(ctx context.Context, tx *sql.Tx, id int64, withSubtasks bool, now string) error {
	if withSubtasks {
		if _, err := tx.ExecContext(ctx, `UPDATE task SET deleted_at = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL`,
			now, now, id); err != nil {
			return err
		}
	}
	res, err := tx.ExecContext(ctx, `UPDATE task SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
		now, now, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	// Deleting an epic leaves its tasks in place, without an epic.
	if _, err = tx.ExecContext(ctx, `UPDATE task SET epic_id = NULL, updated_at = ? WHERE epic_id = ? AND deleted_at IS NULL`, now, id); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE task SET parent_id = NULL, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL`, now, id)
	return err
}
