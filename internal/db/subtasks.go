package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Subtasks follow Jira's three levels: epic → task → subtask. A subtask is
// an ordinary task whose parent_id names another ordinary task without a
// parent. It belongs to its parent's epic, so its own epic_id stays NULL.

// checkParentFields validates parent_id in f for task id (0 when creating),
// given its current type and parent. It also refuses changes that would
// break the levels for a task that already has subtasks. It must run inside
// the write transaction, before checkEpicFields.
func checkParentFields(ctx context.Context, q querier, id int64, curType string, curParent *int64, f Fields) error {
	newType := curType
	if t, ok, err := f.stringField("type"); err != nil {
		return err
	} else if ok {
		newType = t
	}
	parent := curParent
	if raw, ok := f["parent_id"]; ok {
		parent = nil
		if !isNull(raw) {
			var p int64
			if json.Unmarshal(raw, &p) != nil {
				return invalid("parent_id must be an integer")
			}
			parent = &p
		}
	}

	if id != 0 && (parent != nil || newType == "epic") {
		var n int
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM task WHERE parent_id = ? AND deleted_at IS NULL`, id).Scan(&n); err != nil {
			return err
		}
		if n > 0 && newType == "epic" {
			return &ConflictError{Msg: "this task has subtasks; move them out before making it an epic"}
		}
		if n > 0 {
			return invalid("a task with subtasks cannot be a subtask itself")
		}
	}
	if parent == nil {
		return nil
	}
	if newType == "epic" {
		return invalid("an epic cannot be a subtask")
	}
	if id != 0 && *parent == id {
		return invalid("a task cannot be its own parent")
	}
	var pType string
	var pParent *int64
	err := q.QueryRowContext(ctx, `SELECT type, parent_id FROM task WHERE id = ? AND deleted_at IS NULL`, *parent).Scan(&pType, &pParent)
	if err == sql.ErrNoRows {
		return invalid("task %d does not exist", *parent)
	}
	if err != nil {
		return err
	}
	if pType != "task" || pParent != nil {
		return invalid("only an ordinary task can have subtasks (no epics, no subtasks of subtasks)")
	}
	// A subtask takes its parent's epic.
	if raw, ok := f["epic_id"]; ok && !isNull(raw) {
		return invalid("a subtask belongs to its parent's epic and cannot have its own")
	}
	f["epic_id"] = json.RawMessage("null")
	return nil
}

// parentArea is the area of the parent named in f, for a subtask created
// without one.
func (d *DB) parentArea(ctx context.Context, f Fields) (int64, bool, error) {
	p, ok, err := f.int64Field("parent_id")
	if err != nil || !ok {
		return 0, false, err
	}
	var area int64
	err = d.QueryRowContext(ctx, `SELECT area_id FROM task WHERE id = ? AND deleted_at IS NULL`, p).Scan(&area)
	if err == sql.ErrNoRows {
		return 0, false, invalid("task %d does not exist", p)
	}
	return area, err == nil, err
}

// subtaskTotals: for each parent among ids, its subtasks (cancelled ones
// left out) and how many of those are done.
func (d *DB) subtaskTotals(ctx context.Context, ids []any, in string) (map[int64][2]int, error) {
	out := map[int64][2]int{}
	err := scanInto(ctx, d, `SELECT t.parent_id, COUNT(*), SUM(c.behaviour = 'done') FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND c.behaviour <> 'cancelled' AND t.parent_id IN (`+in+`)
		GROUP BY t.parent_id`, func(r *sql.Rows) error {
		var id int64
		var n [2]int
		err := r.Scan(&id, &n[0], &n[1])
		out[id] = n
		return err
	}, ids...)
	return out, err
}

// ListSubtasks returns a task's subtasks, in board order.
func (d *DB) ListSubtasks(ctx context.Context, parentID int64) ([]*Task, error) {
	return d.queryTasks(ctx, &ViewFilter{parent: &parentID}, "", time.Now())
}
