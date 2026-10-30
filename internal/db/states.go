package db

import (
	"context"
	"database/sql"
	"math"
	"sort"
	"time"
)

// State is a buff, debuff or modifier. Phase 2 has the UI; the API and the
// decay maths exist now because the schema carries them.
type State struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Kind         string  `json:"kind"`
	Severity     float64 `json:"severity"` // at day 0
	StartedOn    string  `json:"started_on"`
	DurationDays *int64  `json:"duration_days"` // nil = open ended, no decay
	Decay        string  `json:"decay"`
	ClearedOn    *string `json:"cleared_on"`
	Note         *string `json:"note"`
	CreatedAt    string  `json:"created_at"`

	// Derived on read for the requested day, never written back.
	EffectiveOn       string  `json:"effective_on"`
	EffectiveSeverity float64 `json:"effective_severity"`
	InForce           bool    `json:"in_force"`     // started, not yet cleared, on that day
	DaysRunning       int     `json:"days_running"` // day N since started_on (day 1 = the start), up to clearing
	Ended             bool    `json:"ended"`        // past its duration but not cleared: "ended, not cleared"
}

// decayFactor is f(t) from spec section 6, where t is the fraction of the
// duration elapsed. Curves that would go below zero stop at zero.
func decayFactor(decay string, t float64) float64 {
	if t < 0 {
		t = 0
	}
	switch decay {
	case "linear":
		return math.Max(0, 1-t)
	case "fast":
		return math.Exp(-3 * t)
	case "slow":
		return math.Max(0, 1-t*t)
	default: // static
		return 1
	}
}

// effectiveSeverity is severity x f(t) on day. Before the state starts, or
// from the day it was cleared, it is 0. With no duration, decay is ignored
// and the state holds at full severity until cleared by hand. Reaching zero
// does not clear the state; that is always the user's call.
func effectiveSeverity(s *State, day time.Time) float64 {
	start, err := time.Parse("2006-01-02", s.StartedOn)
	if err != nil || day.Before(start) {
		return 0
	}
	if s.ClearedOn != nil {
		if cleared, err := time.Parse("2006-01-02", *s.ClearedOn); err == nil && !day.Before(cleared) {
			return 0
		}
	}
	if s.DurationDays == nil || *s.DurationDays <= 0 {
		return s.Severity
	}
	days := day.Sub(start).Hours() / 24
	return s.Severity * decayFactor(s.Decay, days/float64(*s.DurationDays))
}

var stateColumns = columns{
	"name":          kText,
	"kind":          kText,
	"severity":      kReal,
	"started_on":    kText,
	"duration_days": kIntNull,
	"decay":         kText,
	"cleared_on":    kTextNull,
	"note":          kTextNull,
}

const stateCols = `id, name, kind, severity, started_on, duration_days, decay, cleared_on, note, created_at`

func scanState(r interface{ Scan(...any) error }) (*State, error) {
	var s State
	err := r.Scan(&s.ID, &s.Name, &s.Kind, &s.Severity, &s.StartedOn, &s.DurationDays, &s.Decay, &s.ClearedOn, &s.Note, &s.CreatedAt)
	return &s, err
}

func checkStateDates(f Fields) error {
	for _, k := range []string{"started_on", "cleared_on"} {
		if v, ok, err := f.stringField(k); err != nil {
			return err
		} else if ok && v != "" && !validDate(v) {
			return invalid("%s must be YYYY-MM-DD", k)
		}
	}
	return nil
}

func withEffective(s *State, on string) *State {
	day, err := time.Parse("2006-01-02", on)
	if err != nil {
		return s
	}
	s.EffectiveOn = on
	s.EffectiveSeverity = effectiveSeverity(s, day)
	s.InForce = s.StartedOn <= on && (s.ClearedOn == nil || on < *s.ClearedOn)
	last := on
	if s.ClearedOn != nil && *s.ClearedOn <= on {
		last = addDays(*s.ClearedOn, -1)
	}
	if s.StartedOn <= last {
		s.DaysRunning = daysBetween(s.StartedOn, last) + 1
	}
	s.Ended = s.InForce && s.DurationDays != nil && *s.DurationDays > 0 && s.DaysRunning > int(*s.DurationDays)
	return s
}

// ListStates returns every state, cleared or not, with its effective
// severity on day (YYYY-MM-DD).
func (d *DB) ListStates(ctx context.Context, on string) ([]*State, error) {
	if !validDate(on) {
		return nil, invalid("on must be YYYY-MM-DD")
	}
	states, err := collect(ctx, d, `SELECT `+stateCols+` FROM state ORDER BY started_on, id`,
		func(r *sql.Rows) (*State, error) { return scanState(r) })
	for _, s := range states {
		withEffective(s, on)
	}
	// In force first, then the longest running; cleared and not-yet-started after.
	sort.SliceStable(states, func(i, j int) bool {
		a, b := states[i], states[j]
		if a.InForce != b.InForce {
			return a.InForce
		}
		return a.DaysRunning > b.DaysRunning
	})
	return states, err
}

func (d *DB) GetState(ctx context.Context, id int64, on string) (*State, error) {
	s, err := scanState(d.QueryRowContext(ctx, `SELECT `+stateCols+` FROM state WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return withEffective(s, on), nil
}

func (d *DB) CreateState(ctx context.Context, f Fields, on string) (*State, error) {
	if err := checkStateDates(f); err != nil {
		return nil, err
	}
	f["created_at"] = rawString(Now())
	spec := columns{"created_at": kText}
	for k, v := range stateColumns {
		spec[k] = v
	}
	id, err := d.insertRow(ctx, "state", f, spec)
	if err != nil {
		return nil, err
	}
	return d.GetState(ctx, id, on)
}

// PatchState edits a state. Clearing is setting cleared_on.
func (d *DB) PatchState(ctx context.Context, id int64, f Fields, on string) (*State, error) {
	if err := checkStateDates(f); err != nil {
		return nil, err
	}
	cols, vals, err := f.decode(stateColumns)
	if err != nil {
		return nil, err
	}
	for i, c := range cols {
		if _, err := d.ExecContext(ctx, `UPDATE state SET `+c+` = ? WHERE id = ?`, vals[i], id); err != nil {
			return nil, uniqueAsConflict(err, "conflict")
		}
	}
	return d.GetState(ctx, id, on)
}

// DeleteState removes a state outright. The table has no deleted_at column;
// clearing (cleared_on) is the normal way to end one.
func (d *DB) DeleteState(ctx context.Context, id int64) error {
	res, err := d.ExecContext(ctx, `DELETE FROM state WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DecayShapes samples f(t) for each decay shape from t = 0 to 1.25 (a
// quarter past the duration), for the picker's small curve sketches. The
// client draws these points; it never evaluates a curve itself.
func DecayShapes() map[string][]float64 {
	out := map[string][]float64{}
	for _, shape := range []string{"static", "linear", "fast", "slow"} {
		pts := make([]float64, 26)
		for i := range pts {
			pts[i] = decayFactor(shape, float64(i)*0.05)
		}
		out[shape] = pts
	}
	return out
}
