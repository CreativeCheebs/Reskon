package db

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

// Stop keeps the time: it is still there after a restart, until the draft is
// saved (which retires the timer in the same transaction) or discarded.
func TestStoppedTimerSurvivesUntilSavedOrDiscarded(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "s.db")
	advance := fakeClock(t, clock0)
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Work")
	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	advance(20 * time.Minute)
	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	d.Close()
	advance(5 * time.Hour)
	if d, err = Open(path); err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	list, _ := d.ListTimers(ctx)
	if len(list.Timers) != 1 || !list.Timers[0].Stopped || list.Timers[0].Draft.Hours != stopped.Draft.Hours || list.Timers[0].ElapsedS != 1200 {
		t.Fatalf("after restart: %+v", list.Timers)
	}
	// A stopped timer does not block a new one; neither does a paused one; conflict counts running only.
	second := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	d.PauseTimer(ctx, second.ID)
	third := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	if l, _ := d.ListTimers(ctx); len(l.Timers) != 3 || l.Conflict {
		t.Errorf("three timers: %+v", l)
	}
	if _, err := d.StartTimer(ctx, fields(t, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))); err == nil {
		t.Error("started while one was running")
	}

	// A save that fails leaves the timer; an unknown timer id is refused and nothing is saved.
	body, _ := json.Marshal(stopped.Draft)
	withTimer := func(id string) Fields {
		f := fields(t, string(body))
		f["timer_id"] = json.RawMessage(id)
		return f
	}
	bad := withTimer(fmt.Sprint(tm.ID))
	bad["hours"] = json.RawMessage("0")
	if _, err := d.CreateSession(ctx, bad); err == nil {
		t.Fatal("a bad draft was saved")
	}
	if l, _ := d.ListTimers(ctx); len(l.Timers) != 3 {
		t.Errorf("a failed save retired the timer: %+v", l.Timers)
	}
	if _, err := d.CreateSession(ctx, withTimer("9999")); err == nil || !isInvalid(err) {
		t.Errorf("unknown timer_id: %v", err)
	}
	if count(t, d, "session") != 0 {
		t.Error("a session was saved with an unknown timer")
	}
	if _, err := d.CreateSession(ctx, withTimer(fmt.Sprint(tm.ID))); err != nil {
		t.Fatal(err)
	}
	if l, _ := d.ListTimers(ctx); len(l.Timers) != 2 {
		t.Errorf("after saving: %+v", l.Timers)
	}
	// The same timer cannot be saved twice.
	if _, err := d.CreateSession(ctx, withTimer(fmt.Sprint(tm.ID))); err == nil || count(t, d, "session") != 1 {
		t.Errorf("a retired timer was used twice: %v", err)
	}
	// Discard works on stopped, paused and running timers.
	d.StopTimer(ctx, third.ID)
	for _, id := range []int64{second.ID, third.ID} {
		if err := d.DiscardTimer(ctx, id); err != nil {
			t.Error(err)
		}
	}
	if l, _ := d.ListTimers(ctx); len(l.Timers) != 0 {
		t.Errorf("after discards: %+v", l.Timers)
	}
}
