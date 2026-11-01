package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Snoozing hides an open task (todo or in_progress behaviour) from boards
// and tables for some days. It is not a status: the task keeps its status
// and board position, and no transition is written. snoozed_until is the
// local date it shows again; from that day it is simply not snoozed (the
// stored date is left as it was). A move into a done or cancelled status
// clears it.
//
// The `snooze` setting caps how many days a task can be snoozed for.

// DefaultSnoozeMaxDays is the cap when the setting is absent.
const DefaultSnoozeMaxDays = 30

// SnoozeRules is the `snooze` setting.
type SnoozeRules struct {
	MaxDays int `json:"max_days"`
}

func loadSnoozeRules(ctx context.Context, q querier) (SnoozeRules, error) {
	r := SnoozeRules{MaxDays: DefaultSnoozeMaxDays}
	var v string
	err := q.QueryRowContext(ctx, `SELECT value FROM setting WHERE key = 'snooze'`).Scan(&v)
	if err == sql.ErrNoRows {
		return r, nil
	}
	if err != nil {
		return r, err
	}
	return r, json.Unmarshal([]byte(v), &r)
}

// checkSnoozeRules validates a `snooze` value before it is saved.
func checkSnoozeRules(value json.RawMessage) error {
	var r SnoozeRules
	if err := json.Unmarshal(value, &r); err != nil {
		return invalid("snooze: %v", err)
	}
	if r.MaxDays < 1 || r.MaxDays > 365 {
		return invalid("snooze: max_days must be from 1 to 365")
	}
	return nil
}

// isSnoozed: the task is open and its snooze date is still ahead of today.
func isSnoozed(until *string, behaviour string, now time.Time) bool {
	if until == nil || (behaviour != "todo" && behaviour != "in_progress") {
		return false
	}
	return *until > now.Format("2006-01-02")
}

// Snooze hides an open task until today + days. Days 0 wakes it now.
// today is the client's local date (todayOr). untilUnblocked hides it
// instead until no open task blocks it (see links.go).
func (d *DB) Snooze(ctx context.Context, id int64, days int, untilUnblocked bool, today string) (*Task, error) {
	today = todayOr(today)
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		cur, err := d.getTask(ctx, tx, id)
		if err != nil {
			return err
		}
		if untilUnblocked {
			var behaviour string
			var blocked bool
			if err := tx.QueryRowContext(ctx, `SELECT c.behaviour, EXISTS (
					SELECT 1 FROM task_link l WHERE l.blocked_id = ? AND `+openBlockerSQL+`)
				FROM status s JOIN status_category c ON c.id = s.category_id WHERE s.id = ?`, id, cur.StatusID).Scan(&behaviour, &blocked); err != nil {
				return err
			}
			if !openBehaviour(behaviour) {
				return invalid("only open tasks (to do or in progress) can be snoozed")
			}
			if !blocked {
				return invalid("no open task blocks this one")
			}
			_, err = tx.ExecContext(ctx, `UPDATE task SET snooze_until_unblocked = 1, updated_at = ? WHERE id = ?`, Now(), id)
			return err
		}
		var until any // NULL wakes the task
		if days != 0 {
			var behaviour string
			if err := tx.QueryRowContext(ctx, `SELECT c.behaviour FROM status s JOIN status_category c ON c.id = s.category_id
				WHERE s.id = ?`, cur.StatusID).Scan(&behaviour); err != nil {
				return err
			}
			if behaviour != "todo" && behaviour != "in_progress" {
				return invalid("only open tasks (to do or in progress) can be snoozed")
			}
			r, err := loadSnoozeRules(ctx, tx)
			if err != nil {
				return err
			}
			if days < 0 || days > r.MaxDays {
				return invalid("snooze for 1 to %d days (Settings → Snooze)", r.MaxDays)
			}
			t, _ := time.Parse("2006-01-02", today)
			until = t.AddDate(0, 0, days).Format("2006-01-02")
		}
		// Waking, or a dated snooze, ends a snooze until unblocked.
		_, err = tx.ExecContext(ctx, `UPDATE task SET snoozed_until = ?, snooze_until_unblocked = 0, updated_at = ? WHERE id = ?`, until, Now(), id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return d.GetTask(ctx, id)
}

// wakeIfFinished clears the snooze of a task that has just moved into a
// done or cancelled status, inside the move's transaction.
func wakeIfFinished(ctx context.Context, tx *sql.Tx, taskID, toStatus int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE task SET snoozed_until = NULL, snooze_until_unblocked = 0
		WHERE id = ? AND (snoozed_until IS NOT NULL OR snooze_until_unblocked = 1) AND EXISTS (
			SELECT 1 FROM status s JOIN status_category c ON c.id = s.category_id
			WHERE s.id = ? AND c.behaviour IN ('done', 'cancelled'))`, taskID, toStatus)
	return err
}
