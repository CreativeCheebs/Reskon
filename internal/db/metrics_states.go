package db

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
)

// state_days: buffs, debuffs and modifiers by the days they were in force.
// A state is in force from started_on up to the day before cleared_on
// (or still, if not cleared). Reaching zero severity does not end it.
// The response also carries each state as one span for the bands widget.

func init() {
	register(&metricDef{
		Name: "state_days", Label: "State days", Unit: "days",
		Description: "Days buffs, debuffs and modifiers were in force. By day: how many were in force that day.",
		Groups:      []string{"day", "kind", "name"},
		Splits:      []string{"kind"},
		Filters:     []string{"kind"}, Reduce: "sum", Ranged: true,
		run: (*DB).stateDays,
	})
}

var stateKindPos = map[string]int64{"debuff": 0, "buff": 1, "modifier": 2}

func (d *DB) stateDays(ctx context.Context, r *metricRun) error {
	kinds := r.q.Filters["kind"]
	for _, k := range kinds {
		if _, ok := stateKindPos[k]; !ok {
			return invalid("a state's kind is buff, debuff or modifier")
		}
	}
	states, err := collect(ctx, d, `SELECT `+stateCols+` FROM state WHERE started_on <= ? AND (cleared_on IS NULL OR cleared_on > ?)
		ORDER BY started_on, id`, func(rows *sql.Rows) (*State, error) { return scanState(rows) }, r.to, r.from)
	if err != nil {
		return err
	}
	r.spans = []StateSpan{}
	for _, s := range states {
		if len(kinds) > 0 && !contains(kinds, s.Kind) {
			continue
		}
		last := r.to // last day in force within the range
		if s.ClearedOn != nil && addDays(*s.ClearedOn, -1) < last {
			last = addDays(*s.ClearedOn, -1)
		}
		first := s.StartedOn
		if first < r.from {
			first = r.from
		}
		if last < first {
			continue
		}
		withEffective(s, last)
		r.spans = append(r.spans, StateSpan{
			StateID: s.ID, Name: s.Name, Kind: s.Kind, From: first, To: last, StartedOn: s.StartedOn,
			Cleared: s.ClearedOn != nil, Severity: s.Severity, EffectiveSeverity: s.EffectiveSeverity,
		})
		split := ""
		if r.q.Split == "kind" {
			split = s.Kind
			r.addSeries(s.Kind, s.Kind, nil, stateKindPos[s.Kind])
		}
		switch r.q.Group {
		case "kind":
			pos := stateKindPos[s.Kind]
			r.label(s.Kind, s.Kind, &pos)
			r.add(s.Kind, split, float64(daysBetween(first, last)+1))
		case "name":
			key := strconv.FormatInt(s.ID, 10)
			r.label(key, s.Name, nil)
			r.details[key] = stateDetail(s, last)
			r.add(key, split, float64(daysBetween(first, last)+1))
		default:
			for day := first; day <= last; day = addDays(day, 1) {
				r.add(r.timeKey(day), split, 1)
			}
		}
	}
	return nil
}

// stateDetail is "debuff · day 4 · 1.4 (from 4)" on day.
func stateDetail(s *State, day string) string {
	out := fmt.Sprintf("%s · day %d · %s", s.Kind, daysBetween(s.StartedOn, day)+1, trimNum(s.EffectiveSeverity))
	if trimNum(s.EffectiveSeverity) != trimNum(s.Severity) {
		out += " (from " + trimNum(s.Severity) + ")"
	}
	return out
}

func trimNum(v float64) string { return strconv.FormatFloat(float64(int64(v*10+0.5))/10, 'f', -1, 64) }

// stateInForce reports whether s is in force on day.
func stateInForce(s *State, day string) bool {
	return s.StartedOn <= day && (s.ClearedOn == nil || day < *s.ClearedOn)
}

