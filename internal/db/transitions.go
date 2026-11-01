package db

import (
	"context"
	"database/sql"
)

// Transition is one row of the append-only status_transition log.
type Transition struct {
	ID           int64  `json:"id"`
	TaskID       int64  `json:"task_id"`
	FromStatusID *int64 `json:"from_status_id"`
	ToStatusID   int64  `json:"to_status_id"`
	Reason       string `json:"reason"`
	At           string `json:"at"`
}

// writeTransition appends one row to the status_transition log. The log is
// append-only: nothing in this package updates or deletes its rows.
func writeTransition(ctx context.Context, tx *sql.Tx, taskID int64, from *int64, to int64, reason, at string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO status_transition (task_id, from_status_id, to_status_id, reason, at)
		VALUES (?, ?, ?, ?, ?)`, taskID, from, to, reason, at)
	return err
}

// Transitions returns a task's log, oldest first.
func (d *DB) Transitions(ctx context.Context, taskID int64) ([]Transition, error) {
	return collect(ctx, d, `SELECT id, task_id, from_status_id, to_status_id, COALESCE(reason, ''), at
		FROM status_transition WHERE task_id = ? ORDER BY at, id`,
		func(r *sql.Rows) (t Transition, err error) {
			err = r.Scan(&t.ID, &t.TaskID, &t.FromStatusID, &t.ToStatusID, &t.Reason, &t.At)
			return
		}, taskID)
}

// MoveRequest is the body of POST /api/tasks/:id/move.
type MoveRequest struct {
	StatusID int64  `json:"status_id"`
	BeforeID *int64 `json:"before_id"` // card that will sit above
	AfterID  *int64 `json:"after_id"`  // card that will sit below
	// Today in the mover's time zone (YYYY-MM-DD), for start and end dates
	// a move fills in. The server's own date when absent.
	Today string `json:"today"`
}

// Move puts a task in a status column at a position. If the status changes,
// the status update and its transition row commit together or not at all.
//
// Moves are last-write-wins: they carry no updated_at check. A pure reorder
// within a column does not bump updated_at, so it never makes an open task
// panel's next edit conflict.
func (d *DB) Move(ctx context.Context, taskID int64, req MoveRequest) (*Task, error) {
	t, _, err := d.MoveReporting(ctx, taskID, req)
	return t, err
}

// MoveReporting is Move, also saying whether the target column was
// renumbered to make room. Only then do the other cards' board_pos change,
// so only then does a board need to reload them.
func (d *DB) MoveReporting(ctx context.Context, taskID int64, req MoveRequest) (*Task, bool, error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	renumbered, err := d.moveTx(ctx, tx, taskID, req)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	t, err := d.GetTask(ctx, taskID)
	return t, renumbered, err
}

// MoveMany puts several tasks in one status, each at the end of its column,
// in one transaction: every status change writes its transition row, and
// either all of them commit or none do. Tasks already in the status stay
// where they are.
func (d *DB) MoveMany(ctx context.Context, taskIDs []int64, statusID int64, today string) ([]*Task, error) {
	if len(taskIDs) == 0 {
		return []*Task{}, nil
	}
	if len(taskIDs) > 1000 {
		return nil, invalid("at most 1000 tasks at a time")
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for _, id := range taskIDs {
		cur, err := d.getTask(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if cur.StatusID == statusID {
			continue
		}
		if _, err := d.moveTx(ctx, tx, id, MoveRequest{StatusID: statusID, Today: today}); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	out := make([]*Task, 0, len(taskIDs))
	for _, id := range taskIDs {
		t, err := d.GetTask(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

// moveTx is one move inside a caller's transaction.
func (d *DB) moveTx(ctx context.Context, tx *sql.Tx, taskID int64, req MoveRequest) (bool, error) {
	cur, err := d.getTask(ctx, tx, taskID)
	if err != nil {
		return false, err
	}
	if err := statusExists(ctx, tx, req.StatusID); err != nil {
		return false, err
	}
	if (req.BeforeID != nil && *req.BeforeID == taskID) || (req.AfterID != nil && *req.AfterID == taskID) {
		return false, invalid("a task cannot be its own neighbour")
	}
	pos, renumbered, err := dropPosition(ctx, tx, taskID, req.StatusID, req.BeforeID, req.AfterID)
	if err != nil {
		return false, err
	}

	if req.StatusID == cur.StatusID {
		_, err = tx.ExecContext(ctx, `UPDATE task SET board_pos = ? WHERE id = ?`, pos, taskID)
	} else {
		now := Now()
		_, err = tx.ExecContext(ctx, `UPDATE task SET status_id = ?, board_pos = ?, updated_at = ? WHERE id = ?`,
			req.StatusID, pos, now, taskID)
		if err == nil {
			from := cur.StatusID
			err = writeTransition(ctx, tx, taskID, &from, req.StatusID, "user", now)
		}
		if err == nil {
			err = applyDateRules(ctx, tx, taskID, req.StatusID, todayOr(req.Today))
		}
		if err == nil {
			err = wakeIfFinished(ctx, tx, taskID, req.StatusID)
		}
	}
	return renumbered, err
}
