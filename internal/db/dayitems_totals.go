package db

import (
	"context"
	"math"
)

// PlanTotals is the planner's one-line summary of a day, all worked out on
// read. Planned time is the sum of the minutes planned on each line (tasks and
// events, set by hand for that day); it is compared with
// the day's available time. These are minutes of time, not energy types:
// nothing here nets one kind of effort against another.
type PlanTotals struct {
	PlannedMin  int64 `json:"planned_min"`
	LoggedMin   int64 `json:"logged_min"`  // everything logged for the day, planned or not
	Unestimated int   `json:"unestimated"` // lines with no planned time set (they add 0 to planned_min)
	// AvailableMin is the day's override, else its weekday's value; nil when
	// neither is set, and then Over is never true. AvailableFrom says which.
	AvailableMin  *int64  `json:"available_min"`
	AvailableFrom *string `json:"available_from"` // "day", "weekday" or nil
	// ReservedMin is the sum of the lines' reserved_min; UnplannedLoggedMin the
	// minutes logged that day that no line counts (not for a planned task, not
	// linked to a planned event). FreeMin is the time still free:
	// available - reserved - unplanned logged (nil without an available time; it may
	// be negative). Over means FreeMin is below zero.
	ReservedMin        int64  `json:"reserved_min"`
	UnplannedLoggedMin int64  `json:"unplanned_logged_min"`
	FreeMin            *int64 `json:"free_min"`
	Over               bool   `json:"over"`
}

// minutesOf turns hours to whole minutes.
func minutesOf(h float64) int64 { return int64(math.Round(h * 60)) }

// planTotals sums items (all of one day) and adds the day's logged time and
// available time.
func (d *DB) planTotals(ctx context.Context, day string, items []*DayItem, override *int64) (PlanTotals, error) {
	var t PlanTotals
	var reservedH float64
	for _, it := range items {
		if it.PlannedMin != nil {
			t.PlannedMin += *it.PlannedMin
		} else {
			t.Unestimated++
		}
		reservedH += it.reservedH
	}
	t.ReservedMin = minutesOf(reservedH)
	unplanned, err := d.unplannedLogged(ctx, day, day, items)
	if err != nil {
		return t, err
	}
	t.UnplannedLoggedMin = minutesOf(unplanned[day])
	var h float64
	if err := d.QueryRowContext(ctx, `SELECT COALESCE(SUM(hours), 0) FROM session WHERE deleted_at IS NULL AND logged_for = ?`, day).Scan(&h); err != nil {
		return t, err
	}
	t.LoggedMin = minutesOf(h)
	t.setAvailable(day, override, d.weekdayAvailable(ctx))
	return t, nil
}
