package db

import (
	"context"
	"testing"
	"time"
)

func TestSegmentsMatchTransitionLog(t *testing.T) {
	trs := []Transition{
		{ToStatusID: 2, At: at(0)},  // created in To do
		{ToStatusID: 3, At: at(5)},  // In progress
		{ToStatusID: 2, At: at(8)},  // back to To do
		{ToStatusID: 4, At: at(20)}, // Done
	}
	segs := segments(trs, t0.Add(30*time.Hour))
	want := []struct {
		status int64
		hours  float64
	}{{2, 5}, {3, 3}, {2, 12}, {4, 10}}
	if len(segs) != len(want) {
		t.Fatalf("got %d segments, want %d", len(segs), len(want))
	}
	total := 0.0
	for i, w := range want {
		if segs[i].StatusID != w.status || segs[i].Hours != w.hours {
			t.Errorf("segment %d = %+v, want status %d %vh", i, segs[i], w.status, w.hours)
		}
		total += segs[i].Hours
	}
	if total != 30 {
		t.Errorf("segments sum to %vh, want the task's whole life (30h)", total)
	}
	if !segs[3].Current || segs[2].Current {
		t.Errorf("only the last segment is current")
	}
	// Segments tile time with no gaps.
	for i := 1; i < len(segs); i++ {
		if segs[i].From != segs[i-1].To {
			t.Errorf("gap between segment %d and %d", i-1, i)
		}
	}
}

func TestCycleTimeForView(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	x := mustTask(t, d, a.ID, "x")
	d.Move(ctx, x.ID, MoveRequest{StatusID: 3})
	ct, err := d.CycleTimeForView(ctx, viewWith(t, d, `{}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(ct.Tasks) != 1 || len(ct.Tasks[0].Segments) != 2 {
		t.Fatalf("cycle time = %+v", ct)
	}
	if ct.Tasks[0].Segments[0].StatusID != 2 || ct.Tasks[0].Segments[1].StatusID != 3 {
		t.Errorf("segment statuses wrong: %+v", ct.Tasks[0].Segments)
	}
	sh := ct.Tasks[0].StatusHours
	if len(sh) != 2 || sh[2] != ct.Tasks[0].Segments[0].Hours || sh[3] != ct.Tasks[0].Segments[1].Hours {
		t.Errorf("status hours = %v", sh)
	}
}
