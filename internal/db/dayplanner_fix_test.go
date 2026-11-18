package db

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

// A timer on an event whose line was deleted still gives a savable draft.
func TestStopAfterTheEventLineWasDeleted(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	advance := fakeClock(t, clock0)
	a := mustArea(t, d, "Personal", "PER")
	ev, _ := d.AddDayItem(ctx, "2026-11-16", fields(t, fmt.Sprintf(`{"title":"Gym","planned_min":60,"area_id":%d}`, a.ID)))
	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","day_item_id":%d}`, ev.ID))
	advance(30 * time.Minute)
	if err := d.DeleteDayItem(ctx, ev.ID); err != nil {
		t.Fatal(err)
	}
	list, _ := d.ListTimers(ctx)
	if got := list.Timers[0]; got.DayItemID != nil || got.Kind != "event" || got.Title != "Gym" {
		t.Errorf("timer listed after its line was deleted: %+v", got)
	}
	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	dr := stopped.Draft
	if dr.DayItemID != nil || dr.Kind != "event" || dr.Label == nil || *dr.Label != "Gym" || dr.Hours != 0.5 {
		t.Fatalf("draft = %+v", dr)
	}
	body, _ := json.Marshal(dr)
	f := fields(t, string(body))
	f["energy_type_id"] = json.RawMessage("1")
	if _, err := d.CreateSession(ctx, f); err != nil {
		t.Errorf("the draft could not be saved: %v", err)
	}
}

func TestZeroLengthTimerDraftIsSavable(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	fakeClock(t, clock0)
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Quick")
	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil || stopped.Draft.Hours != 0.01 {
		t.Fatalf("%+v %v", stopped, err)
	}
	body, _ := json.Marshal(stopped.Draft)
	if _, err := d.CreateSession(ctx, fields(t, string(body))); err != nil {
		t.Errorf("save: %v", err)
	}
}

// A session edit is checked against the session as it would become.
func TestPatchSessionChecksPlanItemAndMergedTimes(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Work")
	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-11-16","started_at":"2026-11-16T10:00:00Z"}`, tk.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchSession(ctx, s.ID, fields(t, `{"day_item_id":9999}`)); err == nil || !isInvalid(err) {
		t.Errorf("a missing plan item: %v", err)
	}
	ev, _ := d.AddDayItem(ctx, "2026-11-16", fields(t, `{"title":"Gone","planned_min":10}`))
	d.DeleteDayItem(ctx, ev.ID)
	if _, err := d.PatchSession(ctx, s.ID, fields(t, fmt.Sprintf(`{"day_item_id":%d}`, ev.ID))); err == nil || !isInvalid(err) {
		t.Errorf("a deleted plan item: %v", err)
	}
	// Only ended_at in the patch, earlier than the stored started_at.
	if _, err := d.PatchSession(ctx, s.ID, fields(t, `{"ended_at":"2026-11-16T09:00:00Z"}`)); err == nil || !isInvalid(err) {
		t.Errorf("ended before the stored start: %v", err)
	}
	if _, err := d.PatchSession(ctx, s.ID, fields(t, `{"ended_at":"2026-11-16T11:00:00Z"}`)); err != nil {
		t.Errorf("a good end: %v", err)
	}
	// And only started_at, later than the stored end.
	if _, err := d.PatchSession(ctx, s.ID, fields(t, `{"started_at":"2026-11-16T12:00:00Z"}`)); err == nil || !isInvalid(err) {
		t.Errorf("started after the stored end: %v", err)
	}
	live := fields(t, `{"title":"Live","planned_min":10}`)
	li, _ := d.AddDayItem(ctx, "2026-11-16", live)
	if got, err := d.PatchSession(ctx, s.ID, fields(t, fmt.Sprintf(`{"day_item_id":%d}`, li.ID))); err != nil || *got.DayItemID != li.ID {
		t.Errorf("a live plan item: %+v %v", got, err)
	}
}

func isInvalid(err error) bool {
	_, ok := err.(*InvalidError)
	return ok
}

// Bring forward is all or nothing.
func TestBringForwardAllOrNothing(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HM")
	good, bad := mustTask(t, d, a.ID, "Good"), mustTask(t, d, a.ID, "Never planned")
	planTask(t, d, "2026-11-09", good.ID)
	if _, err := d.BringForward(ctx, "2026-11-10", []int64{good.ID, bad.ID}); err == nil {
		t.Fatal("a bad task in the list was accepted")
	}
	if day, _ := d.GetDay(ctx, "2026-11-10"); len(day.Items) != 0 {
		t.Errorf("part of the list went in: %+v", day.Items)
	}
}

// Moving a task line to another day retires it and makes a new line (a new
// sync id for the new day), so the old day's id is not shared with a line
// another device plans there.
func TestRescheduledTaskLineGetsANewIdentity(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, home.ID, "Shared")
	planTask(t, srv, "2026-11-10", task.ID)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	pTask := taskByTitle(t, phone, "Shared")

	var oldID int64
	srv.QueryRow(`SELECT id FROM day_item`).Scan(&oldID)
	moved, err := srv.PatchDayItem(ctx, oldID, fields(t, `{"day":"2026-11-12"}`))
	if err != nil {
		t.Fatal(err)
	}
	if moved.ID == oldID || moved.Day != "2026-11-12" || *moved.TaskID != task.ID {
		t.Errorf("moved = %+v (old id %d)", moved, oldID)
	}
	if mustUID(t, srv, "day_item", moved.ID) == mustUID(t, srv, "day_item", oldID) {
		t.Error("the moved line kept its old sync id")
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	// The phone plans the task on the old day: a separate line, not the old one.
	planTask(t, phone, "2026-11-10", pTask.ID)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		var live int
		d.QueryRow(`SELECT COUNT(*) FROM day_item WHERE deleted_at IS NULL`).Scan(&live)
		if live != 2 {
			t.Errorf("%s has %d live lines, want 2 (the 10th and the 12th)", name, live)
		}
	}
}
