package db

import (
	"context"
	"fmt"
	"testing"
)

// Available time shows the time still free: planned lines reserve it, logging
// past the plan reserves more, ticking a line frees what it did not use, and
// work on tasks nobody planned takes time too.
func TestFreeTimeThroughTheDay(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	const day = "2026-11-16"
	a := mustArea(t, d, "Main job", "OM2")
	task := mustTask(t, d, a.ID, "Write")
	loose := mustTask(t, d, a.ID, "Unplanned")
	if _, err := d.PatchDay(ctx, day, fields(t, `{"available_min":480}`)); err != nil {
		t.Fatal(err)
	}
	check := func(what string, reserved, unplanned, free int64) *Day {
		t.Helper()
		got, err := d.GetDay(ctx, day)
		if err != nil {
			t.Fatal(err)
		}
		p := got.PlanTotals
		if p.ReservedMin != reserved || p.UnplannedLoggedMin != unplanned || p.FreeMin == nil || *p.FreeMin != free || p.Over != (free < 0) {
			t.Errorf("%s: reserved %d unplanned %d free %v over %v; want %d %d %d", what, p.ReservedMin, p.UnplannedLoggedMin, p.FreeMin, p.Over, reserved, unplanned, free)
		}
		rows, err := d.DaySummaries(ctx, day, day)
		if err != nil || rows[0].ReservedMin != reserved || rows[0].FreeMin == nil || *rows[0].FreeMin != free || rows[0].Over != (free < 0) {
			t.Errorf("%s: calendar row %+v %v", what, rows, err)
		}
		return got
	}
	check("nothing planned", 0, 0, 480)

	line := planTask(t, d, day, task.ID)
	d.PatchDayItem(ctx, line.ID, fields(t, `{"planned_min":240}`))
	check("a 4h task line", 240, 0, 240)

	ev, _ := d.AddDayItem(ctx, day, fields(t, `{"title":"Workshop","planned_min":180}`))
	check("plus a 3h event", 420, 0, 60)

	// 1h logged on the event, not ticked: still reserves the full 3h.
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"energy_type_id":1,"hours":1,"logged_for":%q}`, ev.ID, day))); err != nil {
		t.Fatal(err)
	}
	got := check("1h logged on the event", 420, 0, 60)
	for _, it := range got.Items {
		if it.ID == ev.ID && (it.LoggedLineMin != 60 || it.ReservedMin != 180 || it.Done) {
			t.Errorf("event line = %+v", it)
		}
	}
	// Ticking it frees the unused 2h.
	if _, err := d.PatchDayItem(ctx, ev.ID, fields(t, `{"done":true}`)); err != nil {
		t.Fatal(err)
	}
	check("event ticked", 300, 0, 180)

	// 5h on the 4h task: it reserves what was logged.
	logHours(t, d, task.ID, day, 5)
	got = check("5h on the 4h task", 360, 0, 120)
	for _, it := range got.Items {
		if it.ID == line.ID && (it.LoggedLineMin != 300 || it.ReservedMin != 300) {
			t.Errorf("task line = %+v", it)
		}
	}
	// Ticking the task line is not finishing the task.
	ticked, err := d.PatchDayItem(ctx, line.ID, fields(t, `{"done":true}`))
	if err != nil || !ticked.Done || ticked.TaskDone || ticked.DoneAt == nil {
		t.Fatalf("tick: %+v %v", ticked, err)
	}
	if tk, _ := d.GetTask(ctx, task.ID); tk.StatusID == 4 || tk.StatusID == 5 {
		t.Error("ticking the line changed the task's status")
	}
	check("task line ticked", 360, 0, 120)

	// Work on a task nobody planned takes time too.
	logHours(t, d, loose.ID, day, 0.5)
	check("30 min on an unplanned task", 360, 30, 90)

	// Un-ticking brings the planned time back; the task's own status is separate.
	un, _ := d.PatchDayItem(ctx, line.ID, fields(t, `{"done":false}`))
	if un.Done || un.DoneAt != nil {
		t.Errorf("untick: %+v", un)
	}
	if _, err := d.Move(ctx, task.ID, MoveRequest{StatusID: 4}); err != nil {
		t.Fatal(err)
	}
	got = check("task finished", 360, 30, 90)
	for _, it := range got.Items {
		if it.ID == line.ID && (!it.Done || !it.TaskDone || it.DoneAt != nil) {
			t.Errorf("finished task's line = %+v", it)
		}
	}
	// Over: a day with less available than reserved.
	d.PatchDay(ctx, day, fields(t, `{"available_min":300}`))
	check("less available", 360, 30, -90)

	// No available time: no free time and no warning.
	d.PatchDay(ctx, day, fields(t, `{"available_min":null}`))
	if got, _ = d.GetDay(ctx, day); got.PlanTotals.FreeMin != nil || got.PlanTotals.Over {
		t.Errorf("without available time: %+v", got.PlanTotals)
	}
}
