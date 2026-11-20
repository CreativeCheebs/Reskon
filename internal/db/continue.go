package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Continue: make the next, different task that comes after a task ("Set up
// NVR" then "Wire garage camera"), and tie both into an epic if wanted.
// The new task records the old one in follows_id; "next" is found by
// looking the other way, so nothing else is stored.

// ContinueInput is what POST /api/tasks/:id/continue takes.
type ContinueInput struct {
	Title string `json:"title"`
	// Copy names what the new task takes from the old one besides its area
	// (always copied): energy_type, priority, level, tags. Null copies all four.
	Copy []string `json:"copy"`
	// Epic says how the two tasks are tied into an epic:
	//   "same": the new task joins the old one's epic (the default when it has one);
	//   "new":  make an epic (EpicTitle, else the old task's title) and put both in it,
	//           or use an epic that already has that title (ignoring capitals);
	//   "pick": put both in the epic EpicID;
	//   "none": no epic (the default when the old task has none).
	// "new" and "pick" are only for a task with no epic of its own; an epic
	// or a subtask takes none of them.
	Epic      string `json:"epic"`
	EpicTitle string `json:"epic_title"`
	EpicID    *int64 `json:"epic_id"`
	// Separate makes a subtask's next task a task of its own instead of the
	// next subtask of the same parent.
	Separate bool   `json:"separate"`
	Today    string `json:"today"`
}

var continueCopies = map[string]bool{"energy_type": true, "priority": true, "level": true, "tags": true}

// ContinueTask makes the task that comes after task id, in the first to do
// status, and returns it. The old task keeps its status. Everything
// happens in one transaction, so an epic is never made without its tasks.
func (d *DB) ContinueTask(ctx context.Context, id int64, in ContinueInput) (*Task, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, invalid("the next task needs a title")
	}
	want := map[string]bool{}
	for _, k := range in.Copy {
		if !continueCopies[k] {
			return nil, invalid("copy: %q is not one of energy_type, priority, level, tags", k)
		}
		want[k] = true
	}
	if in.Copy == nil {
		want = continueCopies
	}
	var newID int64
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		src, err := d.getTask(ctx, tx, id)
		if err != nil {
			return err
		}
		f := Fields{"title": mustJSON(title), "area_id": mustJSON(src.AreaID)}
		if in.Today != "" {
			f["today"] = mustJSON(in.Today)
		}
		if want["energy_type"] && src.EnergyTypeID != nil {
			f["energy_type_id"] = mustJSON(*src.EnergyTypeID)
		}
		if want["priority"] && src.PriorityID != nil {
			f["priority_id"] = mustJSON(*src.PriorityID)
		}
		if want["level"] && src.Difficulty != nil {
			f["difficulty"] = mustJSON(*src.Difficulty)
		}
		if want["tags"] {
			names, err := taskTagNames(ctx, tx, id)
			if err != nil {
				return err
			}
			if len(names) > 0 {
				f["tags"] = mustJSON(names)
			}
		}
		bothInEpic, err := continueEpic(ctx, d, tx, src, in, f)
		if err != nil {
			return err
		}
		if newID, err = d.createTaskTx(ctx, tx, f); err != nil {
			return err
		}
		now := Now()
		if _, err := tx.ExecContext(ctx, `UPDATE task SET follows_id = ? WHERE id = ?`, id, newID); err != nil {
			return err
		}
		if bothInEpic != nil {
			_, err = tx.ExecContext(ctx, `UPDATE task SET epic_id = ?, updated_at = ? WHERE id = ?`, *bothInEpic, now, id)
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return d.GetTask(ctx, newID)
}

// continueEpic fills the new task's type, parent and epic in f from the
// old task and the choice in in. It returns the epic the old task must join
// too, when the choice puts both in one.
func continueEpic(ctx context.Context, d *DB, tx *sql.Tx, src *Task, in ContinueInput, f Fields) (*int64, error) {
	mode := in.Epic
	switch mode {
	case "", "same", "new", "pick", "none":
	default:
		return nil, invalid("epic must be same, new, pick or none")
	}
	switch {
	case src.Type == "epic":
		// An epic can't be in an epic: the next one is an epic of its own.
		if mode != "" && mode != "none" {
			return nil, invalid("an epic can't be inside another epic, so the next epic has none")
		}
		f["type"] = mustJSON("epic")
	case src.ParentID != nil:
		// A subtask belongs to its parent's epic and has none of its own.
		if mode != "" && mode != "none" {
			return nil, invalid("a subtask belongs to its parent's epic, so there is no epic to choose")
		}
		if !in.Separate {
			f["parent_id"] = mustJSON(*src.ParentID)
		}
	case src.EpicID != nil:
		switch mode {
		case "", "same":
			f["epic_id"] = mustJSON(*src.EpicID)
		case "none":
		default:
			return nil, invalid("this task is already in an epic: the next task can join it or have none")
		}
	default:
		switch mode {
		case "", "none":
		case "same":
			return nil, invalid("this task has no epic to share")
		case "pick":
			if in.EpicID == nil {
				return nil, invalid("choose an epic")
			}
			f["epic_id"] = mustJSON(*in.EpicID) // checked by createTaskTx before anything is written
			return in.EpicID, nil
		case "new":
			name := strings.TrimSpace(in.EpicTitle)
			if name == "" {
				name = src.Title
			}
			eid, err := d.epicNamed(ctx, tx, name, src.AreaID, in.Today)
			if err != nil {
				return nil, err
			}
			f["epic_id"] = mustJSON(eid)
			return &eid, nil
		}
	}
	return nil, nil
}

// epicNamed returns the live epic with this title (ignoring capitals), or
// makes one in area, the same way the epic picker's "Create epic" does.
func (d *DB) epicNamed(ctx context.Context, tx *sql.Tx, name string, area int64, today string) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM task WHERE type = 'epic' AND deleted_at IS NULL
		AND lower(title) = lower(?) ORDER BY id LIMIT 1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	f := Fields{"title": mustJSON(name), "area_id": mustJSON(area), "type": mustJSON("epic")}
	if today != "" {
		f["today"] = mustJSON(today)
	}
	return d.createTaskTx(ctx, tx, f)
}

// taskTagNames is the names of a task's tags.
func taskTagNames(ctx context.Context, q querier, id int64) ([]string, error) {
	var names []string
	err := scanInto(ctx, q, `SELECT g.name FROM task_tag tt JOIN tag g ON g.id = tt.tag_id
		WHERE tt.task_id = ? ORDER BY g.name`, func(r *sql.Rows) error {
		var n string
		err := r.Scan(&n)
		names = append(names, n)
		return err
	}, id)
	return names, err
}

// chainOf returns, for tasks among ids, the task each one continues and the
// tasks that continue each one. Deleted tasks are left out.
func (d *DB) chainOf(ctx context.Context, ids []any, in string) (follows map[int64]*LinkedTask, followedBy map[int64][]LinkedTask, err error) {
	follows, followedBy = map[int64]*LinkedTask{}, map[int64][]LinkedTask{}
	const cols = `o.id, o.key, o.title, o.status_id, c.behaviour, o.round_no, o.round_kind FROM task t JOIN task o ON %s AND o.deleted_at IS NULL
		JOIN status s ON s.id = o.status_id JOIN status_category c ON c.id = s.category_id`
	err = scanInto(ctx, d, `SELECT t.id, `+fmt.Sprintf(cols, "o.id = t.follows_id")+` WHERE t.id IN (`+in+`)`, func(r *sql.Rows) error {
		var id int64
		var lt LinkedTask
		err := r.Scan(&id, &lt.ID, &lt.Key, &lt.Title, &lt.StatusID, &lt.Behaviour, &lt.RoundNo, &lt.RoundKind)
		follows[id] = &lt
		return err
	}, ids...)
	if err != nil {
		return
	}
	err = scanInto(ctx, d, `SELECT t.id, `+fmt.Sprintf(cols, "o.follows_id = t.id")+` WHERE t.id IN (`+in+`) ORDER BY o.id`, func(r *sql.Rows) error {
		var id int64
		var lt LinkedTask
		err := r.Scan(&id, &lt.ID, &lt.Key, &lt.Title, &lt.StatusID, &lt.Behaviour, &lt.RoundNo, &lt.RoundKind)
		followedBy[id] = append(followedBy[id], lt)
		return err
	}, ids...)
	return
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // only called with plain values
	}
	return b
}
