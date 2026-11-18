package db

import (
	"context"
	"database/sql"
	"encoding/json"
)

// Day is GET /api/day/:date: the plan plus totals for one local date.
//
// Energy types are reported in one flat list. Hours of one type are never
// subtracted from or divided by another.
type Day struct {
	Day           string         `json:"day"`
	Plan          DayPlan        `json:"plan"`
	Suggested     *Suggested     `json:"suggested"` // what the morning plan offers
	Readout       []ReadoutRow   `json:"readout"`   // hours per energy type against the saved ceiling
	Totals        []EnergyTotal  `json:"totals"`    // hours per energy type
	InForce       []*State       `json:"in_force"`  // states in force that day, shown not entered
	SubtypeTotals []SubtypeTotal `json:"subtype_totals"`
	Sessions      []*Session     `json:"sessions"`
	Items         []*DayItem     `json:"items"`       // the planner's list for the day, in order
	PlanTotals    PlanTotals     `json:"plan_totals"` // planned and logged minutes against the day's available time
}

type DayPlan struct {
	Saved           bool              `json:"saved"` // a plan row exists for the day
	Focus           json.RawMessage   `json:"focus"`
	Ceilings        json.RawMessage   `json:"ceilings"`
	Note            *string           `json:"note"`
	AvailableMin    *int64            `json:"available_min"`    // this day's own override of its weekday's available time; nil = use the weekday's
	CeilingFeedback map[string]string `json:"ceiling_feedback"` // energy type id -> about_right, too_high, too_low
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
	out := &Day{Day: day, Totals: []EnergyTotal{}, SubtypeTotals: []SubtypeTotal{}}
	var focus, ceilings, feedback string
	err := d.QueryRowContext(ctx, `SELECT focus, ceilings, note, ceiling_feedbacks, available_min FROM day_plan WHERE day = ?`, day).
		Scan(&focus, &ceilings, &out.Plan.Note, &feedback, &out.Plan.AvailableMin)
	switch {
	case err == sql.ErrNoRows:
		focus, ceilings, feedback = "[]", "{}", "{}"
	case err != nil:
		return nil, err
	default:
		out.Plan.Saved = true
	}
	out.Plan.Focus, out.Plan.Ceilings = json.RawMessage(focus), json.RawMessage(ceilings)
	out.Plan.CeilingFeedback = parseFeedback(feedback)
	if out.Suggested, err = d.suggest(ctx, day); err != nil {
		return nil, err
	}

	err = scanInto(ctx, d, `SELECT e.id, e.name, SUM(s.hours * `+partShare+`) FROM session s `+sessionPartsJoin+`
		JOIN energy_type e ON e.id = `+partEnergy+`
		WHERE s.deleted_at IS NULL AND s.logged_for = ?
		GROUP BY e.id ORDER BY e.position, e.id`, func(r *sql.Rows) error {
		var t EnergyTotal
		if err := r.Scan(&t.EnergyTypeID, &t.Name, &t.Hours); err != nil {
			return err
		}
		out.Totals = append(out.Totals, t)
		return nil
	}, day)
	if err != nil {
		return nil, err
	}

	energy, err := d.ListEnergyTypes(ctx)
	if err != nil {
		return nil, err
	}
	out.Readout = readout(out.Totals, parseCeilings(ceilings), energy)
	states, err := d.ListStates(ctx, day)
	if err != nil {
		return nil, err
	}
	out.InForce = []*State{}
	for _, s := range states {
		if s.InForce {
			out.InForce = append(out.InForce, s)
		}
	}

	if out.Items, err = d.dayItems(ctx, day, day); err != nil {
		return nil, err
	}
	if out.PlanTotals, err = d.planTotals(ctx, day, out.Items, out.Plan.AvailableMin); err != nil {
		return nil, err
	}
	if out.Sessions, err = d.ListSessions(ctx, SessionQuery{From: day, To: day}); err != nil {
		return nil, err
	}
	names := map[int64]string{}
	if err := scanInto(ctx, d, `SELECT id, name FROM subtype`, func(r *sql.Rows) error {
		var id int64
		var n string
		err := r.Scan(&id, &n)
		names[id] = n
		return err
	}); err != nil {
		return nil, err
	}
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
