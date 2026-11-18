package db

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// planTask puts a task on a day's list.
func planTask(t *testing.T, d *DB, day string, taskID int64) *DayItem {
	t.Helper()
	it, err := d.AddDayItem(context.Background(), day, fields(t, fmt.Sprintf(`{"task_id":%d}`, taskID)))
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func logHours(t *testing.T, d *DB, taskID int64, day string, hours float64) {
	t.Helper()
	if _, err := d.CreateSession(context.Background(), fields(t, fmt.Sprintf(`{"task_id":%d,"hours":%v,"logged_for":%q}`, taskID, hours, day))); err != nil {
		t.Fatal(err)
	}
}

func setEstimate(t *testing.T, d *DB, tk *Task, h float64) {
	t.Helper()
	if _, err := d.PatchTask(context.Background(), tk.ID, fields(t, fmt.Sprintf(`{"estimate_h":%v,"updated_at":%q}`, h, mustTaskUpdatedAt(t, d, tk.ID)))); err != nil {
		t.Fatal(err)
	}
}

// A task planned on two days with time logged on both: its row shows the
// all-time hours against its one estimate, and the day's own hours apart.
func TestPlannedTaskRowShowsAllTimeAndDayHours(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	tk := mustTask(t, d, a.ID, "Write driver")
	setEstimate(t, d, tk, 5)
	planTask(t, d, "2026-11-10", tk.ID)
	planTask(t, d, "2026-11-11", tk.ID)
	logHours(t, d, tk.ID, "2026-11-10", 2)
	logHours(t, d, tk.ID, "2026-11-11", 1.5)
	logHours(t, d, tk.ID, "2026-11-11", 0.5)
	logHours(t, d, tk.ID, "2026-11-09", 1) // not planned that day; counts all-time

	day10, err := d.GetDay(ctx, "2026-11-10")
	if err != nil {
		t.Fatal(err)
	}
	day11, _ := d.GetDay(ctx, "2026-11-11")
	r10, r11 := day10.Items[0], day11.Items[0]
	if r10.LoggedH != 5 || r11.LoggedH != 5 {
		t.Errorf("all-time hours = %v and %v, want 5 on both rows", r10.LoggedH, r11.LoggedH)
	}
	if r10.LoggedDayH != 2 || r11.LoggedDayH != 2 {
		t.Errorf("day hours = %v and %v, want 2 and 2", r10.LoggedDayH, r11.LoggedDayH)
	}
	if r10.EstimateH == nil || *r10.EstimateH != 5 || *r10.PlannedMin != 300 {
		t.Errorf("estimate = %v planned_min = %v, want the whole estimate 5h / 300", r10.EstimateH, r10.PlannedMin)
	}
	// Day totals are day-specific; the planned total counts the full estimate on each day.
	if day10.PlanTotals.LoggedMin != 120 || day11.PlanTotals.LoggedMin != 120 {
		t.Errorf("day logged = %d, %d min, want 120, 120", day10.PlanTotals.LoggedMin, day11.PlanTotals.LoggedMin)
	}
	if day10.PlanTotals.PlannedMin != 300 || day11.PlanTotals.PlannedMin != 300 {
		t.Errorf("planned = %d, %d, want 300 each", day10.PlanTotals.PlannedMin, day11.PlanTotals.PlannedMin)
	}
}

func TestDayItemsEventsOrderRescheduleAndDuplicates(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HM")
	t1, t2 := mustTask(t, d, a.ID, "One"), mustTask(t, d, a.ID, "Two")
	setEstimate(t, d, t1, 1)
	i1 := planTask(t, d, "2026-11-10", t1.ID)
	ev, err := d.AddDayItem(ctx, "2026-11-10", fields(t, fmt.Sprintf(`{"title":"Dentist","planned_min":45,"area_id":%d}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	i2 := planTask(t, d, "2026-11-10", t2.ID)
	if ev.Kind != "event" || ev.Title != "Dentist" || *ev.PlannedMin != 45 || ev.Done {
		t.Errorf("event = %+v", ev)
	}
	// At most one line per task per day.
	_, err = d.AddDayItem(ctx, "2026-11-10", fields(t, fmt.Sprintf(`{"task_id":%d}`, t1.ID)))
	var conflict *ConflictError
	if !errors.As(err, &conflict) {
		t.Errorf("planning a task twice on a day: %v", err)
	}
	if _, err := d.AddDayItem(ctx, "2026-11-10", fields(t, `{"planned_min":30}`)); err == nil {
		t.Error("an event with no title was accepted")
	}

	day, err := d.OrderDay(ctx, "2026-11-10", []int64{i2.ID, ev.ID})
	if err != nil {
		t.Fatal(err)
	}
	got := []int64{day.Items[0].ID, day.Items[1].ID, day.Items[2].ID}
	if got[0] != i2.ID || got[1] != ev.ID || got[2] != i1.ID {
		t.Errorf("order = %v, want [%d %d %d]", got, i2.ID, ev.ID, i1.ID)
	}
	// 60 (task One's estimate) + 45; Two has no estimate.
	if day.PlanTotals.PlannedMin != 105 || day.PlanTotals.Unestimated != 1 {
		t.Errorf("totals = %+v", day.PlanTotals)
	}

	// Reschedule: moves to the end of the other day; a task already there is a conflict.
	moved, err := d.PatchDayItem(ctx, ev.ID, fields(t, `{"day":"2026-11-12","title":"Dentist (moved)","planned_min":60}`))
	if err != nil || moved.Day != "2026-11-12" || moved.Title != "Dentist (moved)" || *moved.PlannedMin != 60 {
		t.Fatalf("reschedule: %+v %v", moved, err)
	}
	planTask(t, d, "2026-11-12", t1.ID)
	if _, err := d.PatchDayItem(ctx, i1.ID, fields(t, `{"day":"2026-11-12"}`)); !errors.As(err, &conflict) {
		t.Errorf("rescheduling onto a day that has the task: %v", err)
	}
	if _, err := d.PatchDayItem(ctx, i1.ID, fields(t, `{"title":"x"}`)); err == nil {
		t.Error("a task line's title was changed")
	}
	if err := d.DeleteDayItem(ctx, i1.ID); err != nil {
		t.Fatal(err)
	}
	day, _ = d.GetDay(ctx, "2026-11-10")
	if len(day.Items) != 1 || day.Items[0].ID != i2.ID {
		t.Errorf("after delete: %+v", day.Items)
	}
	if _, err := d.GetTask(ctx, t1.ID); err != nil {
		t.Errorf("the task went with its line: %v", err)
	}
	// Deleted, it can be planned again.
	planTask(t, d, "2026-11-10", t1.ID)
}

// Bring forward copies; it never moves, and nothing happens by itself.
func TestBringForwardCopiesAndNeverAutomatic(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HM")
	open1, open2 := mustTask(t, d, a.ID, "Unfinished"), mustTask(t, d, a.ID, "Also open")
	done, never := mustTask(t, d, a.ID, "Finished"), mustTask(t, d, a.ID, "Never planned")
	cancelled := mustTask(t, d, a.ID, "Dropped")
	planTask(t, d, "2026-11-08", open1.ID)
	planTask(t, d, "2026-11-09", open1.ID)
	planTask(t, d, "2026-11-09", open2.ID)
	planTask(t, d, "2026-11-09", done.ID)
	planTask(t, d, "2026-11-09", cancelled.ID)
	planTask(t, d, "2026-11-11", open2.ID) // already on the chosen day
	if _, err := d.Move(ctx, done.ID, MoveRequest{StatusID: 4}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Move(ctx, cancelled.ID, MoveRequest{StatusID: 5}); err != nil {
		t.Fatal(err)
	}

	// Looking at a later day shows nothing carried over.
	day, _ := d.GetDay(ctx, "2026-11-10")
	if len(day.Items) != 0 {
		t.Fatalf("items appeared on their own: %+v", day.Items)
	}
	cands, err := d.BringForwardCandidates(ctx, "2026-11-11")
	if err != nil {
		t.Fatal(err)
	}
	// open2 is already on the 11th; done and cancelled are not unfinished; never was not planned.
	if len(cands) != 1 || cands[0].TaskID != open1.ID || cands[0].FromDay != "2026-11-09" || cands[0].Days != 2 {
		t.Fatalf("candidates = %+v", cands)
	}
	// A task planned on a LATER day is not a candidate for an earlier one.
	if c, _ := d.BringForwardCandidates(ctx, "2026-11-07"); len(c) != 0 {
		t.Errorf("candidates for a day before any plan: %+v", c)
	}
	if _, err := d.BringForward(ctx, "2026-11-11", []int64{never.ID}); err == nil {
		t.Error("a task never planned was brought forward")
	}
	if _, err := d.BringForward(ctx, "2026-11-11", []int64{done.ID}); err == nil {
		t.Error("a finished task was brought forward")
	}
	got, err := d.BringForward(ctx, "2026-11-11", []int64{open1.ID, open2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 2 {
		t.Errorf("the 11th has %d lines, want 2 (open2 was there already)", len(got.Items))
	}
	// The earlier days are untouched.
	d8, _ := d.GetDay(ctx, "2026-11-08")
	d9, _ := d.GetDay(ctx, "2026-11-09")
	if len(d8.Items) != 1 || d8.Items[0].TaskID == nil || *d8.Items[0].TaskID != open1.ID {
		t.Errorf("the 8th changed: %+v", d8.Items)
	}
	if len(d9.Items) != 4 {
		t.Errorf("the 9th has %d lines, want 4", len(d9.Items))
	}
	// A task finished after being planned stays on its day, shown done.
	for _, it := range d9.Items {
		if *it.TaskID == done.ID && (!it.Done || *it.StatusBehaviour != "done") {
			t.Errorf("finished task not shown done: %+v", it)
		}
		if *it.TaskID == open1.ID && it.Done {
			t.Errorf("open task shown done")
		}
	}
	if c, _ := d.BringForwardCandidates(ctx, "2026-11-11"); len(c) != 0 {
		t.Errorf("candidates after bringing forward: %+v", c)
	}
}
