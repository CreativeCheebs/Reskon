package db

import (
	"context"
	"math"
)

// PlanTotals is the planner's one-line summary of a day, all worked out on
// read. Planned time is the sum of the full whole-task estimates of the
// planned tasks plus the minutes reserved by events; it is compared with
// the day's available time. These are minutes of time, not energy types:
// nothing here nets one kind of effort against another.
type PlanTotals struct {
	PlannedMin  int64 `json:"planned_min"`
	LoggedMin   int64 `json:"logged_min"`  // everything logged for the day, planned or not
	Unestimated int   `json:"unestimated"` // planned tasks with no estimate (they add 0 to planned_min)
	// AvailableMin is the day's override, else its weekday's value; nil when
	// neither is set, and then Over is never true. AvailableFrom says which.
	AvailableMin  *int64  `json:"available_min"`
	AvailableFrom *string `json:"available_from"` // "day", "weekday" or nil
	Over          bool    `json:"over"`           // planned_min is more than available_min
}

// minutesOf turns hours to whole minutes.
func minutesOf(h float64) int64 { return int64(math.Round(h * 60)) }

// planTotals sums items (all of one day) and adds the day's logged time and
// available time.
func (d *DB) planTotals(ctx context.Context, day string, items []*DayItem, override *int64) (PlanTotals, error) {
	var t PlanTotals
	for _, it := range items {
		if it.PlannedMin != nil {
			t.PlannedMin += *it.PlannedMin
		} else if it.Kind == "task" {
			t.Unestimated++
		}
	}
	var h float64
	if err := d.QueryRowContext(ctx, `SELECT COALESCE(SUM(hours), 0) FROM session WHERE deleted_at IS NULL AND logged_for = ?`, day).Scan(&h); err != nil {
		return t, err
	}
	t.LoggedMin = minutesOf(h)
	t.setAvailable(day, override, d.weekdayAvailable(ctx))
	return t, nil
}
