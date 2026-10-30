package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"strconv"
)

// The day screen's plan (Phase 2 section 6, Change 001): focus areas, an
// optional ceiling for any energy type, and the evening answer on whether
// the ceilings were right. Days are never locked: any day can be edited at any time.

var ceilingFeedback = map[string]bool{"about_right": true, "too_high": true, "too_low": true}

// Ceiling adjustment after "too high": the suggestion drops to 80% of that
// day's ceiling and holds there for three days, then creeps back over four
// more days. Suggestions only; the user decides.
const (
	tooHighFactor = 0.8
	holdDays      = 3
	creepDays     = 4
)

// Suggested is what the morning plan offers when nothing is saved yet:
// yesterday's plan carried forward, adjusted by recent feedback.
type Suggested struct {
	Focus    json.RawMessage     `json:"focus"`
	Ceilings map[string]float64  `json:"ceilings"`
	Held     map[string]HeldNote `json:"held"` // energy type id -> why the number is lower
}

// HeldNote explains a held suggestion: "too high" on Since; Day of the hold
// (1-3) or of the creep back (4-7). Neutral facts for neutral copy.
type HeldNote struct {
	Since string  `json:"since"`
	Day   int     `json:"day"`
	From  float64 `json:"from"` // the ceiling that was too high
}

// ReadoutRow is one energy type in the evening readout. Over is true only
// when its hours passed a ceiling saved for it that day; a type with no
// ceiling never warns.
type ReadoutRow struct {
	EnergyTypeID int64    `json:"energy_type_id"`
	Name         string   `json:"name"`
	Planned      *float64 `json:"planned"`
	Spent        float64  `json:"spent"`
	Over         bool     `json:"over"`
}

// PatchDay saves part of a day's plan, creating the row if needed:
// {focus: [area names], ceilings: {energy_type_id: hours}, note,
// ceiling_feedback: {energy_type_id: answer or null}}. Ceilings replace the
// day's set (a type left out has no ceiling); feedback answers merge, and
// null clears one.
func (d *DB) PatchDay(ctx context.Context, day string, f Fields) (*Day, error) {
	if !validDate(day) {
		return nil, invalid("date must be YYYY-MM-DD")
	}
	sets := map[string]any{}
	for k, raw := range f {
		switch k {
		case "focus":
			var names []string
			if json.Unmarshal(raw, &names) != nil {
				return nil, invalid("focus must be a list of area names")
			}
			if names == nil {
				names = []string{}
			}
			b, _ := json.Marshal(names)
			sets["focus"] = string(b)
		case "ceilings":
			var c map[string]float64
			if json.Unmarshal(raw, &c) != nil {
				return nil, invalid("ceilings must be {energy_type_id: hours}")
			}
			clean := map[string]float64{}
			for id, v := range c {
				n, err := strconv.ParseInt(id, 10, 64)
				if err != nil || v < 0 || v > 24 {
					return nil, invalid("ceiling %s must be 0-24 hours for an energy type id", id)
				}
				if err := d.exists(ctx, "energy_type", n); err != nil {
					return nil, invalid("energy type %s does not exist", id)
				}
				clean[id] = v
			}
			b, _ := json.Marshal(clean)
			sets["ceilings"] = string(b)
		case "note":
			v, err := decodeValue("note", kTextNull, raw)
			if err != nil {
				return nil, err
			}
			sets["note"] = v
		case "ceiling_feedback":
			var answers map[string]*string
			if json.Unmarshal(raw, &answers) != nil {
				return nil, invalid("ceiling_feedback must be {energy_type_id: answer}")
			}
			var current string
			d.QueryRowContext(ctx, `SELECT ceiling_feedbacks FROM day_plan WHERE day = ?`, day).Scan(&current)
			merged := parseFeedback(current)
			for id, v := range answers {
				if _, err := strconv.ParseInt(id, 10, 64); err != nil {
					return nil, invalid("ceiling_feedback keys are energy type ids")
				}
				switch {
				case v == nil:
					delete(merged, id)
				case ceilingFeedback[*v]:
					merged[id] = *v
				default:
					return nil, invalid("ceiling_feedback answers are about_right, too_high, too_low or null")
				}
			}
			b, _ := json.Marshal(merged)
			sets["ceiling_feedbacks"] = string(b)
		default:
			return nil, invalid("field %q cannot be set", k)
		}
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO day_plan (day) VALUES (?)`, day); err != nil {
		return nil, err
	}
	for _, col := range sortedKeys(sets) {
		if _, err := tx.ExecContext(ctx, `UPDATE day_plan SET `+col+` = ? WHERE day = ?`, sets[col], day); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetDay(ctx, day)
}

// roundQuarter keeps suggestions on quarter hours: fine enough that a 1h
// ceiling still drops (to 0.75), coarse enough to read.
func roundQuarter(v float64) float64 { return math.Round(v*4) / 4 }

// suggest carries the latest earlier plan forward and applies the "too
// high" hold. "Too low" and "about right" only end a hold; neither raises
// the number by itself.
func (d *DB) suggest(ctx context.Context, day string) (*Suggested, error) {
	out := &Suggested{Focus: json.RawMessage("[]"), Ceilings: map[string]float64{}, Held: map[string]HeldNote{}}
	var focus string
	err := d.QueryRowContext(ctx, `SELECT focus FROM day_plan WHERE day < ? AND focus != '[]' ORDER BY day DESC LIMIT 1`, day).Scan(&focus)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if focus != "" {
		out.Focus = json.RawMessage(focus)
	}
	// Latest earlier ceiling per energy type.
	plans, err := d.planCeilings(ctx, "0000-00-00", addDays(day, -1))
	if err != nil {
		return nil, err
	}
	latest := map[int64]string{} // energy type -> day of its latest ceiling
	for pd, c := range plans {
		for id := range c {
			if pd > latest[id] {
				latest[id] = pd
			}
		}
	}
	for id, pd := range latest {
		out.Ceilings[strconv.FormatInt(id, 10)] = plans[pd][id]
	}
	// Per energy type, its most recent answer within the hold-and-creep
	// window. Only "too high" holds; any later answer ends the hold.
	type answer struct{ day, value string }
	recent := map[string]answer{}
	err = scanInto(ctx, d, `SELECT day, ceiling_feedbacks FROM day_plan
		WHERE day < ? AND day >= ? AND ceiling_feedbacks != '{}' ORDER BY day`,
		func(r *sql.Rows) error {
			var fd, raw string
			if err := r.Scan(&fd, &raw); err != nil {
				return err
			}
			for id, v := range parseFeedback(raw) {
				recent[id] = answer{fd, v} // later days overwrite earlier ones
			}
			return nil
		}, day, addDays(day, -(holdDays+creepDays)))
	if err != nil {
		return nil, err
	}
	for key, a := range recent {
		id, _ := strconv.ParseInt(key, 10, 64)
		was := plans[a.day][id]
		if a.value != "too_high" || was <= 0 {
			continue
		}
		k := daysBetween(a.day, day) // 1 = the day after
		factor := tooHighFactor
		if k > holdDays {
			factor += (1 - tooHighFactor) * float64(k-holdDays) / float64(creepDays)
		}
		out.Ceilings[key] = roundQuarter(was * factor)
		out.Held[key] = HeldNote{Since: a.day, Day: k, From: was}
	}
	return out, nil
}

// parseFeedback reads {"<energy_type_id>": answer}; unknown answers are
// skipped.
func parseFeedback(raw string) map[string]string {
	var m map[string]string
	json.Unmarshal([]byte(raw), &m)
	out := map[string]string{}
	for k, v := range m {
		if ceilingFeedback[v] {
			out[k] = v
		}
	}
	return out
}

// readout lists every energy type with a ceiling or hours that day, in
// one flat list, each beside the day's own saved ceiling for it.
func readout(totals []EnergyTotal, ceilings map[int64]float64, energy []EnergyType) []ReadoutRow {
	spent := map[int64]float64{}
	for _, t := range totals {
		spent[t.EnergyTypeID] = t.Hours
	}
	out := []ReadoutRow{}
	for _, e := range energy {
		c, planned := ceilings[e.ID]
		if !planned && spent[e.ID] == 0 {
			continue
		}
		row := ReadoutRow{EnergyTypeID: e.ID, Name: e.Name, Spent: spent[e.ID]}
		if planned {
			row.Planned = &c
			row.Over = spent[e.ID] > c
		}
		out = append(out, row)
	}
	return out
}
