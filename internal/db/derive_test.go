package db

import (
	"context"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)

func at(h int) string { return FormatTime(t0.Add(time.Duration(h) * time.Hour)) }

func step(h int, b string) transitionStep { return transitionStep{At: at(h), Behaviour: b} }

func strp(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

func TestDeriveForwardBackForward(t *testing.T) {
	steps := []transitionStep{
		step(0, "todo"),
		step(10, "in_progress"),
		step(20, "todo"), // moved back
		step(30, "in_progress"),
		step(40, "done"),
	}
	now := t0.Add(50 * time.Hour)
	d := deriveDates(at(0), steps, now)
	if strp(d.FirstStartedAt) != at(10) {
		t.Errorf("first started = %s, want %s", strp(d.FirstStartedAt), at(10))
	}
	if strp(d.LastStartedAt) != at(30) {
		t.Errorf("last started = %s, want %s", strp(d.LastStartedAt), at(30))
	}
	if strp(d.CompletedAt) != at(40) {
		t.Errorf("completed = %s, want %s", strp(d.CompletedAt), at(40))
	}
	if d.CreatedAgeH != 50 || *d.StartedAgeH != 40 || d.TimeInStatusH != 10 {
		t.Errorf("ages created=%v started=%v in-status=%v, want 50/40/10", d.CreatedAgeH, *d.StartedAgeH, d.TimeInStatusH)
	}
}

func TestDeriveReopened(t *testing.T) {
	steps := []transitionStep{step(0, "todo"), step(1, "in_progress"), step(2, "done"), step(5, "in_progress")}
	d := deriveDates(at(0), steps, t0.Add(6*time.Hour))
	if d.CompletedAt != nil {
		t.Errorf("reopened task has completed = %s, want nil", *d.CompletedAt)
	}
	// Done again later: completed is the new date.
	steps = append(steps, step(8, "done"))
	d = deriveDates(at(0), steps, t0.Add(9*time.Hour))
	if strp(d.CompletedAt) != at(8) {
		t.Errorf("completed = %s, want %s", strp(d.CompletedAt), at(8))
	}
}

func TestDeriveDoneToDoneKeepsDate(t *testing.T) {
	// Done -> Verified, both in a done category: completion date stays.
	steps := []transitionStep{step(0, "todo"), step(2, "done"), step(4, "done")}
	d := deriveDates(at(0), steps, t0.Add(5*time.Hour))
	if strp(d.CompletedAt) != at(2) {
		t.Errorf("completed = %s, want %s", strp(d.CompletedAt), at(2))
	}
	if d.TimeInStatusH != 1 {
		t.Errorf("time in status = %v, want 1", d.TimeInStatusH)
	}
}

func TestDeriveNeverStarted(t *testing.T) {
	d := deriveDates(at(0), []transitionStep{step(0, "todo")}, t0.Add(3*time.Hour))
	if d.FirstStartedAt != nil || d.StartedAgeH != nil || d.CompletedAt != nil {
		t.Errorf("unstarted task has start/complete dates: %+v", d)
	}
	if d.TimeInStatusH != 3 {
		t.Errorf("time in status = %v, want 3", d.TimeInStatusH)
	}
}

func TestPoints(t *testing.T) {
	four := int64(4)
	high := 1.5
	if p := taskPoints(&four, &high); p == nil || *p != 6 {
		t.Errorf("4 x High = %v, want 6", p)
	}
	if p := taskPoints(&four, nil); p == nil || *p != 4 {
		t.Errorf("4 x unset = %v, want 4", p)
	}
	if p := taskPoints(nil, &high); p != nil {
		t.Errorf("no difficulty = %v, want nil", *p)
	}
}

// End to end through Move: forward, back, forward keeps first-started.
func TestMoveWritesTransitionsAndKeepsFirstStarted(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	const todo, inProgress = 2, 3

	moved, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: inProgress})
	if err != nil {
		t.Fatal(err)
	}
	first := strp(moved.FirstStartedAt)
	if _, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: todo}); err != nil {
		t.Fatal(err)
	}
	final, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: inProgress})
	if err != nil {
		t.Fatal(err)
	}
	if strp(final.FirstStartedAt) != first {
		t.Errorf("first started moved from %s to %s", first, strp(final.FirstStartedAt))
	}
	if strp(final.LastStartedAt) == first {
		t.Errorf("last started did not advance")
	}
	tr, _ := d.Transitions(ctx, tk.ID)
	if len(tr) != 4 {
		t.Errorf("got %d transitions, want 4 (create + 3 moves)", len(tr))
	}
	if tr[0].FromStatusID != nil {
		t.Errorf("creation transition has from_status_id")
	}
	// Reorder within the column writes no transition.
	d.Move(ctx, tk.ID, MoveRequest{StatusID: inProgress})
	if tr, _ := d.Transitions(ctx, tk.ID); len(tr) != 4 {
		t.Errorf("reorder wrote a transition")
	}
}

func TestRemainingH(t *testing.T) {
	est := 12.0
	for _, c := range []struct {
		logged float64
		est    *float64
		want   *float64
	}{
		{3, &est, ptr(9.0)},
		{14.5, &est, ptr(-2.5)}, // over the estimate
		{3, nil, nil},
		{3, ptr(0.0), nil},
	} {
		got := remainingH(c.logged, c.est)
		if (got == nil) != (c.want == nil) || (got != nil && *got != *c.want) {
			t.Errorf("remainingH(%v, %v) = %v, want %v", c.logged, deref(c.est), deref(got), deref(c.want))
		}
	}
}

func TestDuePace(t *testing.T) {
	now := time.Date(2026, 10, 31, 15, 0, 0, 0, time.Local)
	s := func(v string) *string { return &v }
	for _, c := range []struct {
		due       *string
		remaining *float64
		days      *int
		pace      *float64
	}{
		{s("2026-11-02"), ptr(9.0), iptr(2), ptr(3.0)}, // today, Sunday, Monday
		{s("2026-10-31"), ptr(4.0), iptr(0), ptr(4.0)}, // due today: one day
		{s("2026-10-29"), ptr(4.0), iptr(-2), nil},     // overdue
		{s("2026-11-02"), ptr(-1.0), iptr(2), nil},     // already over the estimate
		{s("2026-11-02"), nil, iptr(2), nil},           // no estimate
		{nil, ptr(9.0), nil, nil},
	} {
		days, pace := duePace(c.due, c.remaining, now)
		if (days == nil) != (c.days == nil) || (days != nil && *days != *c.days) ||
			(pace == nil) != (c.pace == nil) || (pace != nil && *pace != *c.pace) {
			t.Errorf("duePace(%v, %v) = %v, %v; want %v, %v", deref2(c.due), deref(c.remaining), days, deref(pace), c.days, deref(c.pace))
		}
	}
}

func iptr(n int) *int { return &n }

func deref2(p *string) string {
	if p == nil {
		return "nil"
	}
	return *p
}
