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

// epicCounts returns, for each epic among ids, how many non-deleted tasks
// belong to it and how many of those are in a done-behaviour status.
func (d *DB) epicCounts(ctx context.Context, ids []any, in string) (map[int64][2]int, error) {
	out := map[int64][2]int{}
	err := scanInto(ctx, d, `SELECT t.epic_id, COUNT(*), SUM(c.behaviour = 'done') FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND c.behaviour <> 'cancelled' AND t.epic_id IN (`+in+`)
		GROUP BY t.epic_id`, func(r *sql.Rows) error {
		var id int64
		var total, done int
		err := r.Scan(&id, &total, &done)
		out[id] = [2]int{total, done}
		return err
	}, ids...)
	return out, err
}
