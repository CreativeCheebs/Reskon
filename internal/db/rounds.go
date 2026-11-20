package db

import (
	"context"
	"database/sql"
	"strings"
)

// Rounds: the same task done again ("Clean home #3", or "Board layout v2").
// Every round is its own task with its own hours and points. A series is
// held together by round_of (the first round's id); round_no never changes,
// so deleting #2 leaves a gap and #3 stays #3. Numbers are not edited by
// hand (owner's choice, 2026-11-20).

// Round is one round of a series, as the task panel lists it.
type Round struct {
	ID          int64   `json:"id"`
	Key         string  `json:"key"`
	Title       string  `json:"title"`
	No          int64   `json:"no"`
	Behaviour   string  `json:"behaviour"`
	CompletedAt *string `json:"completed_at"`
	LoggedH     float64 `json:"logged_h"`
	Points      float64 `json:"points"` // the session points stored on its own sessions
}

// RoundInput is what POST /api/tasks/:id/next-round takes.
type RoundInput struct {
	// Kind is "round" (#) or "version" (v), used when a task gets its first
	// next round; later rounds keep the series' kind. Empty means round.
	Kind string `json:"kind"`
	// SnoozeUntil, a local date, starts the new round snoozed until then.
	SnoozeUntil *string `json:"snooze_until"`
	Today       string  `json:"today"`
}

func validRoundKind(k string) bool { return k == "round" || k == "version" }

// NextRound makes the next round of task id, in the first to do status,
// and returns it. A task that has no rounds yet becomes round 1. The new
// round copies the title, description, area, energy type, priority, level,
// estimate, epic, parent, tags and custom fields. Any round can start the
// next one; the number is one past the highest the series ever had.
func (d *DB) NextRound(ctx context.Context, id int64, in RoundInput) (*Task, error) {
	kind := in.Kind
	if kind == "" {
		kind = "round"
	}
	if !validRoundKind(kind) {
		return nil, invalid("kind must be round or version")
	}
	var newID int64
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		src, err := d.getTask(ctx, tx, id)
		if err != nil {
			return err
		}
		if src.Type == "epic" {
			return invalid("an epic can't have rounds")
		}
		now := Now()
		series := id
		if src.RoundOf == nil {
			if _, err := tx.ExecContext(ctx, `UPDATE task SET round_of = ?, round_no = 1, round_kind = ?, updated_at = ? WHERE id = ?`,
				id, kind, now, id); err != nil {
				return err
			}
		} else {
			series = *src.RoundOf
			if src.RoundKind != nil {
				kind = *src.RoundKind
			}
		}
		var top sql.NullInt64
		if err := tx.QueryRowContext(ctx, `SELECT MAX(round_no) FROM task WHERE round_of = ?`, series).Scan(&top); err != nil {
			return err
		}

		f := Fields{"title": mustJSON(src.Title), "area_id": mustJSON(src.AreaID)}
		if in.Today != "" {
			f["today"] = mustJSON(in.Today)
		}
		if in.SnoozeUntil != nil {
			f["snooze_until"] = mustJSON(*in.SnoozeUntil)
		}
		for k, v := range map[string]any{
			"description": src.Description, "energy_type_id": src.EnergyTypeID, "priority_id": src.PriorityID,
			"difficulty": src.Difficulty, "estimate_h": src.EstimateH, "epic_id": src.EpicID, "parent_id": src.ParentID,
		} {
			if !isNilPtr(v) {
				f[k] = mustJSON(v)
			}
		}
		names, err := taskTagNames(ctx, tx, id)
		if err != nil {
			return err
		}
		if len(names) > 0 {
			f["tags"] = mustJSON(names)
		}
		if newID, err = d.createTaskTx(ctx, tx, f); err != nil {
			return err
		}
		// Custom values are copied as stored: a field option removed since
		// must not stop the next round.
		_, err = tx.ExecContext(ctx, `UPDATE task SET round_of = ?, round_no = ?, round_kind = ?, custom = ? WHERE id = ?`,
			series, top.Int64+1, kind, string(src.Custom), newID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return d.GetTask(ctx, newID)
}

func isNilPtr(v any) bool {
	switch p := v.(type) {
	case *string:
		return p == nil
	case *int64:
		return p == nil
	case *float64:
		return p == nil
	}
	return v == nil
}

// SetRoundKind shows every round of task id's series as rounds (#3) or
// versions (v3).
func (d *DB) SetRoundKind(ctx context.Context, id int64, kind string) (*Task, error) {
	if !validRoundKind(kind) {
		return nil, invalid("kind must be round or version")
	}
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		src, err := d.getTask(ctx, tx, id)
		if err != nil {
			return err
		}
		if src.RoundOf == nil {
			return invalid("this task has no rounds yet")
		}
		_, err = tx.ExecContext(ctx, `UPDATE task SET round_kind = ?, updated_at = ? WHERE round_of = ? AND deleted_at IS NULL`,
			kind, Now(), *src.RoundOf)
		return err
	})
	if err != nil {
		return nil, err
	}
	return d.GetTask(ctx, id)
}

// roundsOf lists every live round of t's series, oldest first, with each
// one's completed date, hours and stored points, worked out on read.
func (d *DB) roundsOf(ctx context.Context, t *Task) ([]Round, error) {
	out := []Round{}
	if t.RoundOf == nil {
		return out, nil
	}
	tasks, err := collect(ctx, d, `SELECT `+taskCols+` FROM task WHERE round_of = ? AND deleted_at IS NULL ORDER BY round_no, id`,
		func(r *sql.Rows) (*Task, error) { return scanTask(r) }, *t.RoundOf)
	if err != nil || len(tasks) == 0 {
		return out, err
	}
	if err := d.derive(ctx, tasks, d.Now(ctx)); err != nil {
		return nil, err
	}
	ids := make([]any, len(tasks))
	for i, r := range tasks {
		ids[i] = r.ID
	}
	points := map[int64]float64{}
	if err := scanInto(ctx, d, `SELECT task_id, COALESCE(SUM(points), 0) FROM session
		WHERE deleted_at IS NULL AND task_id IN (`+placeholders(len(ids))+`) GROUP BY task_id`, func(r *sql.Rows) error {
		var id int64
		var p float64
		err := r.Scan(&id, &p)
		points[id] = p
		return err
	}, ids...); err != nil {
		return nil, err
	}
	for _, r := range tasks {
		var no int64
		if r.RoundNo != nil {
			no = *r.RoundNo
		}
		out = append(out, Round{ID: r.ID, Key: r.Key, Title: strings.TrimSpace(r.Title), No: no, Behaviour: r.Behaviour,
			CompletedAt: r.CompletedAt, LoggedH: r.LoggedH, Points: points[r.ID]})
	}
	return out, nil
}
