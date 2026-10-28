package db

import (
	"context"
	"math"
	"testing"
	"time"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestDecayCurves(t *testing.T) {
	cases := []struct {
		decay         string
		t0, mid, past float64 // f(0), f(0.5), f(1.5)
	}{
		{"static", 1, 1, 1},
		{"linear", 1, 0.5, 0},
		{"fast", 1, math.Exp(-1.5), math.Exp(-4.5)},
		{"slow", 1, 0.75, 0},
	}
	for _, c := range cases {
		if got := decayFactor(c.decay, 0); !near(got, c.t0) {
			t.Errorf("%s f(0) = %v, want %v", c.decay, got, c.t0)
		}
		if got := decayFactor(c.decay, 0.5); !near(got, c.mid) {
			t.Errorf("%s f(0.5) = %v, want %v", c.decay, got, c.mid)
		}
		if got := decayFactor(c.decay, 1.5); !near(got, c.past) {
			t.Errorf("%s f(1.5) = %v, want %v", c.decay, got, c.past)
		}
	}
}

func TestEffectiveSeverity(t *testing.T) {
	day := func(s string) time.Time { d, _ := time.Parse("2006-01-02", s); return d }
	seven := int64(7)
	fever := &State{Severity: 4, StartedOn: "2026-10-01", DurationDays: &seven, Decay: "linear"}

	if got := effectiveSeverity(fever, day("2026-09-30")); got != 0 {
		t.Errorf("before start = %v, want 0", got)
	}
	if got := effectiveSeverity(fever, day("2026-10-01")); got != 4 {
		t.Errorf("day 0 = %v, want 4", got)
	}
	if got := effectiveSeverity(fever, day("2026-10-08")); got != 0 {
		t.Errorf("day 7 = %v, want 0", got)
	}
	// Day 12 of a 7-day fever: zero, but still a listed, uncleared state.
	if got := effectiveSeverity(fever, day("2026-10-13")); got != 0 {
		t.Errorf("day 12 = %v, want 0", got)
	}
	// Open ended: no decay.
	open := &State{Severity: 2, StartedOn: "2026-10-01", Decay: "fast"}
	if got := effectiveSeverity(open, day("2027-01-01")); got != 2 {
		t.Errorf("open-ended = %v, want 2", got)
	}
	cleared := "2026-10-03"
	open.ClearedOn = &cleared
	if got := effectiveSeverity(open, day("2026-10-03")); got != 0 {
		t.Errorf("cleared = %v, want 0", got)
	}
}

func TestZeroedStateStaysListed(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if _, err := d.CreateState(ctx, fields(t, `{"name":"Fever","kind":"debuff","severity":3,"started_on":"2026-10-01","duration_days":7,"decay":"linear"}`), "2026-10-01"); err != nil {
		t.Fatal(err)
	}
	states, err := d.ListStates(ctx, "2026-10-13")
	if err != nil {
		t.Fatal(err)
	}
	if len(states) != 1 || states[0].EffectiveSeverity != 0 || states[0].ClearedOn != nil {
		t.Errorf("states on day 12 = %+v", states)
	}
}
