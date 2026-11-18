package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Available time (owner decision). The setting planner_available holds the
// minutes available on each weekday: {"sun": 300, "mon": 480, ...}. A weekday
// missing or null is "not set". A day may override it (day_plan.available_min).
// Where neither is set the planner shows no available time and never warns
// about being over.

const settingPlannerAvailable = "planner_available"

var weekdayKeys = [7]string{"sun", "mon", "tue", "wed", "thu", "fri", "sat"} // time.Weekday order

func checkPlannerAvailable(value json.RawMessage) error {
	var m map[string]*int64
	if json.Unmarshal(value, &m) != nil {
		return invalid(`planner_available must be {"sun": minutes, "mon": minutes, ...}`)
	}
	for k, v := range m {
		known := false
		for _, w := range weekdayKeys {
			known = known || w == k
		}
		if !known {
			return invalid("planner_available: %q is not a weekday (sun, mon, tue, wed, thu, fri, sat)", k)
		}
		if v != nil && (*v < 0 || *v > 1440) {
			return invalid("planner_available: %s must be 0 to 1440 minutes", k)
		}
	}
	return nil
}

// weekdayAvailable reads the setting; a missing or unreadable one is all unset.
func (d *DB) weekdayAvailable(ctx context.Context) [7]*int64 {
	var out [7]*int64
	var m map[string]*int64
	if ok, err := d.Setting(ctx, settingPlannerAvailable, &m); !ok || err != nil {
		return out
	}
	for i, k := range weekdayKeys {
		out[i] = m[k]
	}
	return out
}

// availableOn is the effective available time of a day: the override, else
// its weekday's value, else nil.
func availableOn(day string, override *int64, weekly [7]*int64) (*int64, *string) {
	if override != nil {
		from := "day"
		return override, &from
	}
	t, err := time.Parse(dateFmt, day)
	if err != nil {
		return nil, nil
	}
	if v := weekly[t.Weekday()]; v != nil {
		from := "weekday"
		return v, &from
	}
	return nil, nil
}

func (t *PlanTotals) setAvailable(day string, override *int64, weekly [7]*int64) {
	t.AvailableMin, t.AvailableFrom = availableOn(day, override, weekly)
	t.Over = t.AvailableMin != nil && t.PlannedMin > *t.AvailableMin
}

// DaySummary is one day of the calendar view: what is planned against what
// is available. Over is never true without an available time.
type DaySummary struct {
	Day           string  `json:"day"`
	Items         int     `json:"items"`
	DoneItems     int     `json:"done_items"`
	PlannedMin    int64   `json:"planned_min"`
	LoggedMin     int64   `json:"logged_min"`
	AvailableMin  *int64  `json:"available_min"`
	AvailableFrom *string `json:"available_from"`
	Over          bool    `json:"over"`
}

const maxSummaryDays = 100

// DaySummaries is the planner's calendar: one row per day from..to, empty
// days included (they still show their available time).
func (d *DB) DaySummaries(ctx context.Context, from, to string) ([]DaySummary, error) {
	if !validDate(from) || !validDate(to) {
		return nil, invalid("from and to must be YYYY-MM-DD")
	}
	if to < from || daysBetween(from, to) >= maxSummaryDays {
		return nil, invalid("from..to must be 1 to %d days", maxSummaryDays)
	}
	items, err := d.dayItems(ctx, from, to)
	if err != nil {
		return nil, err
	}
	logged := map[string]float64{}
	overrides := map[string]int64{}
	if err := scanInto(ctx, d, `SELECT logged_for, SUM(hours) FROM session WHERE deleted_at IS NULL AND logged_for >= ? AND logged_for <= ? GROUP BY logged_for`,
		func(r *sql.Rows) error {
			var day string
			var h float64
			err := r.Scan(&day, &h)
			logged[day] = h
			return err
		}, from, to); err != nil {
		return nil, err
	}
	if err := scanInto(ctx, d, `SELECT day, available_min FROM day_plan WHERE available_min IS NOT NULL AND day >= ? AND day <= ?`,
		func(r *sql.Rows) error {
			var day string
			var m int64
			err := r.Scan(&day, &m)
			overrides[day] = m
			return err
		}, from, to); err != nil {
		return nil, err
	}
	weekly := d.weekdayAvailable(ctx)
	out := []DaySummary{}
	for day := from; day <= to; day = addDays(day, 1) {
		s := DaySummary{Day: day}
		out = append(out, s)
	}
	idx := map[string]int{}
	for i, s := range out {
		idx[s.Day] = i
	}
	for _, it := range items {
		s := &out[idx[it.Day]]
		s.Items++
		if it.Done {
			s.DoneItems++
		}
		if it.PlannedMin != nil {
			s.PlannedMin += *it.PlannedMin
		}
	}
	for i := range out {
		s := &out[i]
		s.LoggedMin = minutesOf(logged[s.Day])
		var ov *int64
		if m, ok := overrides[s.Day]; ok {
			ov = &m
		}
		t := PlanTotals{PlannedMin: s.PlannedMin}
		t.setAvailable(s.Day, ov, weekly)
		s.AvailableMin, s.AvailableFrom, s.Over = t.AvailableMin, t.AvailableFrom, t.Over
	}
	return out, nil
}
