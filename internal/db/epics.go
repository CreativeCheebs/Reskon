package db

import (
	"context"
	"database/sql"
	"encoding/json"
)

// Epics are tasks with type "epic". An ordinary task may belong to one
// epic (epic_id); an epic cannot belong to another epic.

// checkEpicFields validates type and epic_id in f for task id (0 when
// creating), given its current type and epic. It must run inside the write
// transaction.
func checkEpicFields(ctx context.Context, q querier, id int64, curType string, curEpic *int64, f Fields) error {
	newType := curType
	if t, ok, err := f.stringField("type"); err != nil {
		return err
	} else if ok {
		if t != "task" && t != "epic" {
			return invalid("type must be task or epic")
		}
		newType = t
	}
	epic := curEpic
	if raw, ok := f["epic_id"]; ok {
		epic = nil
		if !isNull(raw) {
			var e int64
			if json.Unmarshal(raw, &e) != nil {
				return invalid("epic_id must be an integer")
			}
			epic = &e
		}
	}

	if newType == "epic" {
		if epic != nil {
			if _, sent := f["epic_id"]; sent {
				return invalid("an epic cannot belong to another epic")
			}
			// Turning a task with an epic into an epic: drop the old link.
			f["epic_id"] = json.RawMessage("null")
		}
		return nil
	}

	// Becoming an ordinary task: refuse while tasks still belong to it.
	if curType == "epic" && id != 0 {
		var n int
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM task WHERE epic_id = ? AND deleted_at IS NULL`, id).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return &ConflictError{Msg: "this epic still has tasks; move them out first"}
		}
	}
	if epic != nil {
		if id != 0 && *epic == id {
			return invalid("a task cannot be its own epic")
		}
		var t string
		err := q.QueryRowContext(ctx, `SELECT type FROM task WHERE id = ? AND deleted_at IS NULL`, *epic).Scan(&t)
		if err == sql.ErrNoRows {
			return invalid("epic %d does not exist", *epic)
		}
		if err != nil {
			return err
		}
		if t != "epic" {
			return invalid("task %d is not an epic", *epic)
		}
	}
	return nil
}

// epicTotals is what an epic adds up from its tasks, on read.
type epicTotals struct {
	tasks, done int
	estimateH   float64
	loggedH     float64
}

// epicTotalsOf returns, for each epic among ids: how many non-deleted tasks
// belong to it and how many of those are done (cancelled ones left out of
// both), their summed estimates (also without cancelled), and every hour
// logged against them. Cancelled tasks' hours still count: the time was spent.
func (d *DB) epicTotalsOf(ctx context.Context, ids []any, in string) (map[int64]*epicTotals, error) {
	out := map[int64]*epicTotals{}
	of := func(id int64) *epicTotals {
		if out[id] == nil {
			out[id] = &epicTotals{}
		}
		return out[id]
	}
	err := scanInto(ctx, d, `SELECT t.epic_id, COUNT(*), SUM(c.behaviour = 'done'), COALESCE(SUM(t.estimate_h), 0) FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND c.behaviour <> 'cancelled' AND t.epic_id IN (`+in+`)
		GROUP BY t.epic_id`, func(r *sql.Rows) error {
		var id int64
		var total, done int
		var est float64
		err := r.Scan(&id, &total, &done, &est)
		e := of(id)
		e.tasks, e.done, e.estimateH = total, done, est
		return err
	}, ids...)
	if err != nil {
		return nil, err
	}
	// Hours on a task's subtasks count for its epic too: a subtask has no
	// epic of its own, it belongs to its parent's.
	err = scanInto(ctx, d, `SELECT COALESCE(t.epic_id, p.epic_id) AS epic, SUM(s.hours) FROM session s
		JOIN task t ON t.id = s.task_id
		LEFT JOIN task p ON p.id = t.parent_id AND p.deleted_at IS NULL
		WHERE s.deleted_at IS NULL AND t.deleted_at IS NULL AND COALESCE(t.epic_id, p.epic_id) IN (`+in+`)
		GROUP BY epic`, func(r *sql.Rows) error {
		var id int64
		var h float64
		err := r.Scan(&id, &h)
		of(id).loggedH = h
		return err
	}, ids...)
	return out, err
}
