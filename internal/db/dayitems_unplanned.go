package db

import (
	"context"
	"database/sql"
	"fmt"
)

// unplannedLogged is, per day from..to, the hours logged that no plan line
// counts: sessions that are not for a task planned on that day and not
// linked to an event line of that day. items are the lines of the range.
func (d *DB) unplannedLogged(ctx context.Context, from, to string, items []*DayItem) (map[string]float64, error) {
	// Lines are keyed by their day, so a session linked to an event that was moved to
	// another day is not counted by it on the day the session was logged for.
	tasks, events := map[string]bool{}, map[string]bool{}
	for _, it := range items {
		if it.TaskID != nil {
			tasks[fmt.Sprintf("%s|%d", it.Day, *it.TaskID)] = true
		} else {
			events[fmt.Sprintf("%s|%d", it.Day, it.ID)] = true
		}
	}
	out := map[string]float64{}
	err := scanInto(ctx, d, `SELECT logged_for, task_id, day_item_id, hours FROM session
		WHERE deleted_at IS NULL AND logged_for >= ? AND logged_for <= ?`, func(r *sql.Rows) error {
		var day string
		var task, item sql.NullInt64
		var h float64
		if err := r.Scan(&day, &task, &item, &h); err != nil {
			return err
		}
		// Counted by at most one line; an event link wins over the task.
		if item.Valid && events[fmt.Sprintf("%s|%d", day, item.Int64)] {
			return nil
		}
		if task.Valid && tasks[fmt.Sprintf("%s|%d", day, task.Int64)] {
			return nil
		}
		out[day] += h
		return nil
	}, from, to)
	return out, err
}
