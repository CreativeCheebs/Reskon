package db

import (
	"context"
	"database/sql"
	"strings"
)

// MaxForecastDates is how many dates one forecast may ask about.
const MaxForecastDates = 100

// SnoozeDay is what is already coming back from snooze on one local date:
// the summed estimates (hours) of the open tasks whose snooze ends that day,
// and the points those estimates would earn.
type SnoozeDay struct {
	Date   string  `json:"date"`
	Hours  float64 `json:"hours"`
	Points float64 `json:"points"`
}

// SnoozeForecast answers, for each date, what snoozed tasks wake that exact
// day (snoozed_until is a local date, so the match is on the text). Tasks
// that are done, cancelled or deleted, tasks with no estimate and the task
// excludeID (the one being snoozed; 0 for none) add nothing. Points are
// worked out like a session's: hours x the energy type's points rate x
// difficulty (sessionPoints), times the priority weight as taskPoints does;
// a missing rate, difficulty or weight counts as 1. Energy types are only
// ever added, never netted. Every date asked for comes back, in the order
// asked, with zeros when nothing wakes.
func (d *DB) SnoozeForecast(ctx context.Context, dates []string, excludeID int64) ([]SnoozeDay, error) {
	if len(dates) > MaxForecastDates {
		return nil, invalid("ask about at most %d dates", MaxForecastDates)
	}
	for _, s := range dates {
		if !validDate(s) {
			return nil, invalid("dates must be YYYY-MM-DD, got %q", s)
		}
	}
	out := make([]SnoozeDay, len(dates))
	if len(dates) == 0 {
		return out, nil
	}
	args := make([]any, 0, len(dates)+1)
	for _, s := range dates {
		args = append(args, s)
	}
	args = append(args, excludeID)
	sums := map[string]*SnoozeDay{}
	err := scanInto(ctx, d, `SELECT t.snoozed_until, t.estimate_h, t.difficulty, e.points_per_hour, p.weight
		FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		LEFT JOIN energy_type e ON e.id = t.energy_type_id
		LEFT JOIN priority p ON p.id = t.priority_id
		WHERE t.deleted_at IS NULL AND c.behaviour IN ('todo', 'in_progress')
		  AND t.estimate_h > 0 AND t.snoozed_until IN (`+strings.TrimSuffix(strings.Repeat("?,", len(dates)), ",")+`)
		  AND t.id != ?`, func(r *sql.Rows) error {
		var until string
		var estimate float64
		var difficulty *int64
		var rate, weight *float64
		if err := r.Scan(&until, &estimate, &difficulty, &rate, &weight); err != nil {
			return err
		}
		rt, w := 1.0, 1.0
		if rate != nil {
			rt = *rate
		}
		if weight != nil {
			w = *weight
		}
		day := sums[until]
		if day == nil {
			day = &SnoozeDay{}
			sums[until] = day
		}
		day.Hours += estimate
		day.Points += *sessionPoints(rt, estimate, nil, difficulty) * w
		return nil
	}, args...)
	if err != nil {
		return nil, err
	}
	for i, s := range dates {
		out[i].Date = s
		if day := sums[s]; day != nil {
			out[i].Hours, out[i].Points = day.Hours, day.Points
		}
	}
	return out, nil
}
