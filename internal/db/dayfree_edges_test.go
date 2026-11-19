package db

import (
	"context"
	"fmt"
	"testing"
)

// A session is for an event line or for a task, never both, so it can't
// reserve the same hours twice.
func TestEventSessionCannotNameATask(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	const day = "2026-11-16"
	a := mustArea(t, d, "Main job", "OM2")
	task := mustTask(t, d, a.ID, "Write")
	planTask(t, d, day, task.ID)
	ev, err := d.AddDayItem(ctx, day, fields(t, `{"title":"Workshop","planned_min":60}`))
	if err != nil {
		t.Fatal(err)
	}
	_, err = d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"task_id":%d,"energy_type_id":1,"hours":1,"logged_for":%q}`, ev.ID, task.ID, day)))
	if err == nil {
		t.Fatal("a session naming both an event line and a task was accepted")
	}
}

// A session linked to an event that later moved to another day counts as
// unplanned on the day it was logged for, in the day view and the calendar alike.
func TestMovedEventSessionCountsOnItsOwnDay(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	const day1, day2 = "2026-11-16", "2026-11-17"
	for _, day := range []string{day1, day2} {
		if _, err := d.PatchDay(ctx, day, fields(t, `{"available_min":480}`)); err != nil {
			t.Fatal(err)
		}
	}
	ev, err := d.AddDayItem(ctx, day1, fields(t, `{"title":"Workshop","planned_min":120}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"energy_type_id":1,"hours":1,"logged_for":%q}`, ev.ID, day1))); err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchDayItem(ctx, ev.ID, fields(t, fmt.Sprintf(`{"day":%q}`, day2))); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetDay(ctx, day1)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := d.DaySummaries(ctx, day1, day2)
	if err != nil {
		t.Fatal(err)
	}
	p := got.PlanTotals
	if p.UnplannedLoggedMin != 60 || p.FreeMin == nil || *p.FreeMin != 420 {
		t.Errorf("day view of %s: unplanned %d free %v; want 60 and 420", day1, p.UnplannedLoggedMin, p.FreeMin)
	}
	if rows[0].FreeMin == nil || *rows[0].FreeMin != *p.FreeMin {
		t.Errorf("calendar row for %s = %+v; day view free %v", day1, rows[0], p.FreeMin)
	}
	if rows[1].FreeMin == nil || *rows[1].FreeMin != 360 {
		t.Errorf("calendar row for %s = %+v; want 360 free (2h event, nothing logged that day)", day2, rows[1])
	}
}
