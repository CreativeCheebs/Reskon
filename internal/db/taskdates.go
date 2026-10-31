package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"slices"
	"time"
)

// Start and end dates are task fields the person can set by hand. A move
// can also fill them in, by the `task_dates` setting:
//
//   - start: on entering one of StartStatuses, an empty start date becomes
//     today. It is never cleared by a move.
//   - end: on entering one of EndStatuses, an empty end date becomes today.
//     Moving back to an open status (todo or in_progress behaviour) clears
//     it, the way Completed returns to empty when a task is reopened.
//
// Nil status lists mean the defaults, by behaviour: start on in_progress,
// end on done and cancelled. Either rule can be turned off (manual only).

// DateRules is the `task_dates` setting.
type DateRules struct {
	StartAuto     bool    `json:"start_auto"`
	StartStatuses []int64 `json:"start_statuses"`
	EndAuto       bool    `json:"end_auto"`
	EndStatuses   []int64 `json:"end_statuses"`
}

func loadDateRules(ctx context.Context, q querier) (DateRules, error) {
	r := DateRules{StartAuto: true, EndAuto: true}
	var v string
	err := q.QueryRowContext(ctx, `SELECT value FROM setting WHERE key = 'task_dates'`).Scan(&v)
	if err == sql.ErrNoRows {
		return r, nil
	}
	if err != nil {
		return r, err
	}
	return r, json.Unmarshal([]byte(v), &r)
}

// checkDateRules validates a `task_dates` value before it is saved.
func checkDateRules(value json.RawMessage) error {
	var r DateRules
	if err := json.Unmarshal(value, &r); err != nil {
		return invalid("task_dates: %v", err)
	}
	return nil
}

// applyDateRules runs after a task's status changes to toStatus, inside the
// same transaction as the move.
func applyDateRules(ctx context.Context, tx *sql.Tx, taskID, toStatus int64, today string) error {
	r, err := loadDateRules(ctx, tx)
	if err != nil {
		return err
	}
	if !r.StartAuto && !r.EndAuto {
		return nil
	}
	var behaviour string
	if err := tx.QueryRowContext(ctx, `SELECT c.behaviour FROM status s JOIN status_category c ON c.id = s.category_id
		WHERE s.id = ?`, toStatus).Scan(&behaviour); err != nil {
		return err
	}
	in := func(ids []int64, byBehaviour ...string) bool {
		if ids == nil {
			return slices.Contains(byBehaviour, behaviour)
		}
		return slices.Contains(ids, toStatus)
	}
	if r.StartAuto && in(r.StartStatuses, "in_progress") {
		if _, err := tx.ExecContext(ctx, `UPDATE task SET start_date = ? WHERE id = ? AND start_date IS NULL`, today, taskID); err != nil {
			return err
		}
	}
	if r.EndAuto {
		switch {
		case in(r.EndStatuses, "done", "cancelled"):
			_, err = tx.ExecContext(ctx, `UPDATE task SET end_date = ? WHERE id = ? AND end_date IS NULL`, today, taskID)
		case behaviour == "todo" || behaviour == "in_progress":
			_, err = tx.ExecContext(ctx, `UPDATE task SET end_date = NULL WHERE id = ?`, taskID)
		}
	}
	return err
}

// todayOr is the client's local date when it sent a valid one, else the
// server's.
func todayOr(s string) string {
	if validDate(s) {
		return s
	}
	return time.Now().Format("2006-01-02")
}

// localDate takes the optional "today" out of a create body (it is not a
// column) and returns the date to use.
func localDate(f Fields) string {
	var s string
	if raw, ok := f["today"]; ok {
		json.Unmarshal(raw, &s)
		delete(f, "today")
	}
	return todayOr(s)
}
