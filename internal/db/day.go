package db

import (
	"context"
	"database/sql"
	"encoding/json"
)

// Day is GET /api/day/:date: the plan plus totals for one local date.
//
// Spend and restore are reported as two separate lists. There is no
// combined figure, ratio or balance: nothing nets rest against work.
type Day struct {
	Day           string         `json:"day"`
	Plan          DayPlan        `json:"plan"`
	Spend         []EnergyTotal  `json:"spend"`
	Restore       []EnergyTotal  `json:"restore"`
	SubtypeTotals []SubtypeTotal `json:"subtype_totals"`
	Sessions      []*Session     `json:"sessions"`
}

type DayPlan struct {
	Focus    json.RawMessage `json:"focus"`
	Ceilings json.RawMessage `json:"ceilings"`
	LockedAt *string         `json:"locked_at"`
	Note     *string         `json:"note"`
}

type EnergyTotal struct {
	EnergyTypeID int64   `json:"energy_type_id"`
	Name         string  `json:"name"`
	Hours        float64 `json:"hours"`
}

type SubtypeTotal struct {
	SubtypeID int64   `json:"subtype_id"`
	Name      string  `json:"name"`
	WeightedH float64 `json:"weighted_h"`
}

func (d *DB) GetDay(ctx context.Context, day string) (*Day, error) {
	if !validDate(day) {
		return nil, invalid("date must be YYYY-MM-DD")
	}
	out := &Day{Day: day, Spend: []EnergyTotal{}, Restore: []EnergyTotal{}, SubtypeTotals: []SubtypeTotal{}}
	var focus, ceilings string
	err := d.QueryRowContext(ctx, `SELECT focus, ceilings, locked_at, note FROM day_plan WHERE day = ?`, day).
		Scan(&focus, &ceilings, &out.Plan.LockedAt, &out.Plan.Note)
	switch {
	case err == sql.ErrNoRows:
		focus, ceilings = "[]", "{}"
	case err != nil:
		return nil, err
	}
	out.Plan.Focus, out.Plan.Ceilings = json.RawMessage(focus), json.RawMessage(ceilings)

	err = scanInto(ctx, d, `SELECT e.id, e.name, e.direction, SUM(s.hours) FROM session s
		JOIN energy_type e ON e.id = s.energy_type_id
		WHERE s.deleted_at IS NULL AND s.logged_for = ?
		GROUP BY e.id ORDER BY e.position, e.id`, func(r *sql.Rows) error {
		var t EnergyTotal
		var dir string
		if err := r.Scan(&t.EnergyTypeID, &t.Name, &dir, &t.Hours); err != nil {
			return err
		}
		if dir == "restore" {
			out.Restore = append(out.Restore, t)
		} else {
			out.Spend = append(out.Spend, t)
		}
		return nil
	}, day)
	if err != nil {
		return nil, err
	}

	if out.Sessions, err = d.ListSessions(ctx, SessionQuery{From: day, To: day}); err != nil {
		return nil, err
	}
	names := map[int64]string{}
	scanInto(ctx, d, `SELECT id, name FROM subtype`, func(r *sql.Rows) error {
		var id int64
		var n string
		err := r.Scan(&id, &n)
		names[id] = n
		return err
	})
	totals := map[int64]float64{}
	var order []int64
	for _, s := range out.Sessions {
		for _, st := range s.Subtypes {
			if _, seen := totals[st.SubtypeID]; !seen {
				order = append(order, st.SubtypeID)
			}
			totals[st.SubtypeID] += st.WeightedH
		}
	}
	for _, id := range order {
		out.SubtypeTotals = append(out.SubtypeTotals, SubtypeTotal{SubtypeID: id, Name: names[id], WeightedH: totals[id]})
	}
	return out, nil
}
