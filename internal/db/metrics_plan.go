package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Metrics that set each energy type's hours against the day's own plan.
// Any type may have a ceiling; a type without one is never compared.

func init() {
	register(&metricDef{
		Name: "days_over_plan", Label: "Days over plan", Unit: "list",
		Description: "Days where at least one energy type went over that day's own ceiling for it, with what happened.",
		Groups:      []string{"day"},
		Filters:     []string{"energy_type"}, Reduce: "count", Ranged: true,
		run: (*DB).daysOverPlan,
	})
	register(&metricDef{
		Name: "ceiling_vs_actual", Label: "Ceiling vs actual", Unit: "ratio",
		Description: "Hours as a share of the planned ceiling (1 = exactly the ceiling), per type that had one, on days with a saved plan.",
		Groups:      []string{"day", "energy_type"},
		Filters:     []string{"energy_type"}, Reduce: "max", Ranged: true,
		run: (*DB).ceilingVsActual,
	})
	register(&metricDef{
		Name: "drift", Label: "Drift", Unit: "days",
		Description: "The current run of low days (under the threshold, counting the energy types chosen in Settings), set beside the break the morning plans intended. Elapsed as fact.",
		Groups:      []string{"now"},
		Reduce:      "last",
		run:         (*DB).drift,
	})
}

// planCeilings reads saved ceilings per day: day -> energy type -> hours.
func (d *DB) planCeilings(ctx context.Context, from, to string) (map[string]map[int64]float64, error) {
	out := map[string]map[int64]float64{}
	err := scanInto(ctx, d, `SELECT day, ceilings FROM day_plan WHERE day >= ? AND day <= ? ORDER BY day`, func(r *sql.Rows) error {
		var day, raw string
		if err := r.Scan(&day, &raw); err != nil {
			return err
		}
		out[day] = parseCeilings(raw)
		return nil
	}, from, to)
	return out, err
}

// parseCeilings reads {"<energy_type_id>": hours}; anything else is skipped.
func parseCeilings(raw string) map[int64]float64 {
	var m map[string]float64
	json.Unmarshal([]byte(raw), &m)
	out := map[int64]float64{}
	for k, v := range m {
		if id, err := strconv.ParseInt(k, 10, 64); err == nil {
			out[id] = v
		}
	}
	return out
}

// hoursByDay sums hours: day -> energy type -> hours.
func (d *DB) hoursByDay(ctx context.Context, from, to string) (map[string]map[int64]float64, error) {
	out := map[string]map[int64]float64{}
	err := scanInto(ctx, d, `SELECT s.logged_for, s.energy_type_id, SUM(s.hours) FROM session s
		WHERE s.deleted_at IS NULL AND s.logged_for >= ? AND s.logged_for <= ?
		GROUP BY s.logged_for, s.energy_type_id`, func(r *sql.Rows) error {
		var day string
		var id int64
		var h float64
		if err := r.Scan(&day, &id, &h); err != nil {
			return err
		}
		if out[day] == nil {
			out[day] = map[int64]float64{}
		}
		out[day][id] = h
		return nil
	}, from, to)
	return out, err
}

// ceilingTypes keeps the energy types a plan has a ceiling for, narrowed
// by an energy_type filter.
func (r *metricRun) ceilingTypes(ceilings map[int64]float64) ([]int64, error) {
	var keep map[int64]bool
	if v := r.q.Filters["energy_type"]; len(v) > 0 {
		ids, err := resolveIDs("energy type", v, r.energy)
		if err != nil {
			return nil, err
		}
		keep = idSet(ids)
	}
	var out []int64
	for id, c := range ceilings {
		if r.energy[id] == nil || c <= 0 || (keep != nil && !keep[id]) {
			continue
		}
		out = append(out, id)
	}
	return out, nil
}

func (d *DB) daysOverPlan(ctx context.Context, r *metricRun) error {
	r.sparse = true
	plans, err := d.planCeilings(ctx, r.from, r.to)
	if err != nil {
		return err
	}
	hours, err := d.hoursByDay(ctx, r.from, r.to)
	if err != nil {
		return err
	}
	for day, ceilings := range plans {
		types, err := r.ceilingTypes(ceilings)
		if err != nil {
			return err
		}
		var over []string
		n := 0.0
		for _, id := range types {
			if spent := hours[day][id]; spent > ceilings[id] {
				over = append(over, fmt.Sprintf("%s %s of %s", r.energy[id].name, trimNum(spent), trimNum(ceilings[id])))
				n++
			}
		}
		if n > 0 {
			r.add(day, "", n)
			r.details[day] = strings.Join(sortedStrings(over), " · ")
		}
	}
	return nil
}

func sortedStrings(s []string) []string {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
	return s
}

func (d *DB) ceilingVsActual(ctx context.Context, r *metricRun) error {
	plans, err := d.planCeilings(ctx, r.from, r.to)
	if err != nil {
		return err
	}
	hours, err := d.hoursByDay(ctx, r.from, r.to)
	if err != nil {
		return err
	}
	planned, spent := map[string]float64{}, map[string]float64{}
	for day, ceilings := range plans {
		types, err := r.ceilingTypes(ceilings)
		if err != nil {
			return err
		}
		for _, id := range types {
			key := r.timeKey(day)
			if r.q.Group == "energy_type" {
				key = r.lookupKey("energy_type", id, false)
			}
			planned[key] += ceilings[id]
			spent[key] += hours[day][id]
		}
	}
	for key, p := range planned {
		r.add(key, "", spent[key]/p)
		r.details[key] = trimNum(spent[key]) + " of " + trimNum(p)
	}
	if r.q.Group == "day" {
		r.sparse = true // days without a plan have no ratio, not a zero
	}
	return nil
}

// drift counts back from today through days whose hours, over the energy
// types in the drift_energy_types setting, stayed under drift_low_hours,
// and how many of those days a saved plan intended as a break (those
// types' ceilings adding up to under the same line). Facts only.
func (d *DB) drift(ctx context.Context, r *metricRun) error {
	low := 1.0
	d.Setting(ctx, "drift_low_hours", &low)
	var counted []int64
	d.Setting(ctx, "drift_energy_types", &counted)
	types := idSet(counted)
	var plans int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM day_plan`).Scan(&plans)
	from := addDays(r.today, -365)
	hours, err := d.hoursByDay(ctx, from, r.today)
	if err != nil {
		return err
	}
	ceilings, err := d.planCeilings(ctx, from, r.today)
	if err != nil {
		return err
	}
	run, planned := 0, 0
	day := r.today
	for ; day >= from && len(types) > 0; day = addDays(day, -1) {
		if sumTypes(hours[day], types) >= low {
			break
		}
		run++
		if c, ok := ceilings[day]; ok && len(c) > 0 && sumTypes(c, types) < low {
			planned++
		}
	}
	r.add("now", "", float64(run))
	r.label("now", "Current run", nil)
	r.meta = map[string]any{"run": run, "planned_break": planned, "has_plans": plans > 0, "low_hours": low, "counted_types": len(types)}
	if run > 0 {
		r.meta["run_start"] = addDays(r.today, -(run - 1))
	}
	return nil
}

// sumTypes adds the hours of the given energy types. Adding is allowed:
// it never subtracts or divides one type by another.
func sumTypes(byType map[int64]float64, types map[int64]bool) float64 {
	total := 0.0
	for id, h := range byType {
		if types[id] {
			total += h
		}
	}
	return total
}
