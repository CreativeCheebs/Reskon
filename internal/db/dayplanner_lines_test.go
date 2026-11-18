package db

import (
	"context"
	"fmt"
	"testing"
)

// A task line can have its own name and its own planned time for its day.
func TestTaskLineOwnTitleAndPlannedTime(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	tk := mustTask(t, d, a.ID, "Implement feature A")
	setEstimate(t, d, tk, 8)

	it, err := d.AddDayItem(ctx, "2026-11-10", fields(t, fmt.Sprintf(`{"task_id":%d,"title":"Implement feature A.X","planned_min":90}`, tk.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if it.Title != "Implement feature A.X" || it.TaskTitle == nil || *it.TaskTitle != "Implement feature A" || !it.Renamed ||
		*it.PlannedMin != 90 || *it.EstimateH != 8 || it.Kind != "task" {
		t.Fatalf("line = %+v", it)
	}
	plain := planTask(t, d, "2026-11-11", tk.ID)
	if plain.Title != "Implement feature A" || plain.Renamed || plain.PlannedMin != nil {
		t.Errorf("a plain line = %+v", plain)
	}
	day, _ := d.GetDay(ctx, "2026-11-11")
	if day.PlanTotals.PlannedMin != 0 || day.PlanTotals.Unestimated != 1 {
		t.Errorf("totals with nothing planned: %+v", day.PlanTotals)
	}

	// Rename and clear: "" and null both go back to the task's title.
	got, err := d.PatchDayItem(ctx, plain.ID, fields(t, `{"title":"Part B","planned_min":30}`))
	if err != nil || got.Title != "Part B" || !got.Renamed || *got.PlannedMin != 30 {
		t.Fatalf("rename: %+v %v", got, err)
	}
	for _, clear := range []string{`{"title":""}`, `{"title":null}`} {
		d.PatchDayItem(ctx, plain.ID, fields(t, `{"title":"again"}`))
		if got, err = d.PatchDayItem(ctx, plain.ID, fields(t, clear)); err != nil || got.Title != "Implement feature A" || got.Renamed {
			t.Errorf("clear with %s: %+v %v", clear, got, err)
		}
	}
	if got, _ = d.PatchDayItem(ctx, plain.ID, fields(t, `{"planned_min":null}`)); got.PlannedMin != nil {
		t.Errorf("planned_min cleared: %+v", got)
	}
	if _, err := d.PatchDayItem(ctx, plain.ID, fields(t, `{"planned_min":-5}`)); err == nil {
		t.Error("negative planned_min accepted")
	}

	// Moving the line keeps its own title and planned time.
	moved, err := d.PatchDayItem(ctx, it.ID, fields(t, `{"day":"2026-11-12"}`))
	if err != nil || moved.Title != "Implement feature A.X" || *moved.PlannedMin != 90 {
		t.Errorf("moved: %+v %v", moved, err)
	}

	// Bring forward copies the name of the most recent earlier line, not the minutes.
	got2, err := d.BringForward(ctx, "2026-11-13", []int64{tk.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(got2.Items) != 1 || got2.Items[0].Title != "Implement feature A.X" || !got2.Items[0].Renamed || got2.Items[0].PlannedMin != nil {
		t.Errorf("brought forward: %+v", got2.Items)
	}
	// An earlier line with no name of its own brings none.
	t2 := mustTask(t, d, a.ID, "Plain")
	planTask(t, d, "2026-11-01", t2.ID)
	if got3, _ := d.BringForward(ctx, "2026-11-13", []int64{t2.ID}); got3.Items[1].Renamed {
		t.Errorf("a plain line was brought forward renamed: %+v", got3.Items[1])
	}
}

// A session can be logged against a task line; it must be the line's task.
func TestSessionFromATaskLine(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	tk, other := mustTask(t, d, a.ID, "Mine"), mustTask(t, d, a.ID, "Other")
	line := planTask(t, d, "2026-11-10", tk.ID)

	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"hours":1,"logged_for":"2026-11-10"}`, line.ID)))
	if err != nil || s.TaskID == nil || *s.TaskID != tk.ID || s.Kind != "task" || *s.DayItemID != line.ID {
		t.Fatalf("filled from the line: %+v %v", s, err)
	}
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"task_id":%d,"hours":1,"logged_for":"2026-11-10"}`, line.ID, other.ID))); !isInvalid(err) {
		t.Errorf("a line of another task: %v", err)
	}
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"task_id":%d,"hours":1,"logged_for":"2026-11-10"}`, line.ID, tk.ID))); err != nil {
		t.Errorf("the right task: %v", err)
	}
	// Patch: the same checks.
	plainS, _ := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-11-10"}`, other.ID)))
	if _, err := d.PatchSession(ctx, plainS.ID, fields(t, fmt.Sprintf(`{"day_item_id":%d}`, line.ID))); !isInvalid(err) {
		t.Errorf("patching onto another task's line: %v", err)
	}
	if got, err := d.PatchSession(ctx, plainS.ID, fields(t, fmt.Sprintf(`{"task_id":%d,"day_item_id":%d}`, tk.ID, line.ID))); err != nil || *got.TaskID != tk.ID || *got.DayItemID != line.ID {
		t.Errorf("moving a session to the line's task: %+v %v", got, err)
	}
	// A session with no task takes the line's.
	free, err := d.CreateSession(ctx, fields(t, `{"label":"loose","kind":"event","energy_type_id":1,"hours":1,"logged_for":"2026-11-10"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got, err := d.PatchSession(ctx, free.ID, fields(t, fmt.Sprintf(`{"day_item_id":%d}`, line.ID))); err != nil || got.TaskID == nil || *got.TaskID != tk.ID {
		t.Errorf("a loose session patched onto a line: %+v %v", got, err)
	}
	// A task line can be ticked done for its day without touching the task.
	if got, err := d.PatchDayItem(ctx, line.ID, fields(t, `{"done":true}`)); err != nil || !got.Done || got.TaskDone {
		t.Errorf("tick a task line: %+v %v", got, err)
	}
}

// Done on an event, and the new line fields, reach the other device.
func TestSyncEventDoneAndLineFields(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, home.ID, "Shared")
	ev, _ := srv.AddDayItem(ctx, "2026-11-10", fields(t, `{"title":"Dentist","planned_min":45}`))
	line, _ := srv.AddDayItem(ctx, "2026-11-10", fields(t, fmt.Sprintf(`{"task_id":%d,"title":"Shared (part)","planned_min":20}`, task.ID)))
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if _, err := srv.PatchDayItem(ctx, ev.ID, fields(t, `{"done":true}`)); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	day, err := phone.GetDay(ctx, "2026-11-10")
	if err != nil || len(day.Items) != 2 {
		t.Fatalf("%v %+v", err, day)
	}
	for _, it := range day.Items {
		switch it.Kind {
		case "event":
			if !it.Done || it.DoneAt == nil {
				t.Errorf("event done did not sync: %+v", it)
			}
		default:
			if it.Title != "Shared (part)" || it.PlannedMin == nil || *it.PlannedMin != 20 {
				t.Errorf("line fields did not sync: %+v (server id %d)", it, line.ID)
			}
		}
	}
	// And back: the phone un-marks it.
	var pev int64
	phone.QueryRow(`SELECT id FROM day_item WHERE kind = 'event'`).Scan(&pev)
	if _, err := phone.PatchDayItem(ctx, pev, fields(t, `{"done":false}`)); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	if got, _ := srv.GetDayItem(ctx, ev.ID); got.Done {
		t.Errorf("un-marking did not sync: %+v", got)
	}
}
