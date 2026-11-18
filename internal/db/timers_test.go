package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// fakeClock replaces the timer clock for one test and returns a way to move it.
func fakeClock(t *testing.T, start time.Time) func(time.Duration) {
	t.Helper()
	now := start
	old := timeNow
	timeNow = func() time.Time { return now }
	t.Cleanup(func() { timeNow = old })
	return func(by time.Duration) { now = now.Add(by) }
}

var clock0 = time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)

func startOn(t *testing.T, d *DB, js string) *Timer {
	t.Helper()
	tm, err := d.StartTimer(context.Background(), fields(t, js))
	if err != nil {
		t.Fatal(err)
	}
	return tm
}

func TestTimerPauseResumeStopWithAClock(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	advance := fakeClock(t, clock0)
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Write")

	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	if !tm.Running || tm.ElapsedS != 0 || tm.Kind != "task" || tm.Title != "Write" || tm.StartedAt != FormatTime(clock0) {
		t.Fatalf("started: %+v", tm)
	}
	advance(25 * time.Minute)
	got, _ := d.GetTimer(ctx, tm.ID)
	if got.ElapsedS != 1500 {
		t.Errorf("elapsed after 25 min = %d", got.ElapsedS)
	}
	paused, err := d.PauseTimer(ctx, tm.ID)
	if err != nil || paused.Running || paused.ResumedAt != nil || paused.AccumulatedS != 1500 || paused.ElapsedS != 1500 {
		t.Fatalf("paused: %+v %v", paused, err)
	}
	advance(2 * time.Hour) // a break: not counted
	if got, _ = d.GetTimer(ctx, tm.ID); got.ElapsedS != 1500 {
		t.Errorf("a paused timer kept counting: %d", got.ElapsedS)
	}
	if again, err := d.PauseTimer(ctx, tm.ID); err != nil || again.AccumulatedS != 1500 {
		t.Errorf("pausing twice: %+v %v", again, err)
	}
	resumed, err := d.ResumeTimer(ctx, tm.ID)
	if err != nil || !resumed.Running || resumed.StartedAt != FormatTime(clock0) {
		t.Fatalf("resumed: %+v %v", resumed, err)
	}
	advance(15 * time.Minute)

	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	dr := stopped.Draft
	if dr.Hours != anyEq(40.0/60) || dr.Kind != "task" || *dr.TaskID != tk.ID || dr.LoggedFor != "2026-11-16" ||
		dr.StartedAt != FormatTime(clock0) || dr.EndedAt != FormatTime(clock0.Add(2*time.Hour+40*time.Minute)) {
		t.Errorf("draft = %+v", dr)
	}
	// Stop saves nothing; the timer stays, stopped, with its draft, and stopping again gives the same draft.
	if count(t, d, "session") != 0 {
		t.Error("stop logged a session")
	}
	if list, _ := d.ListTimers(ctx); len(list.Timers) != 1 || !list.Timers[0].Stopped || list.Timers[0].Running || list.Timers[0].Draft == nil || !reflect.DeepEqual(*list.Timers[0].Draft, dr) || list.Conflict {
		t.Errorf("timers after stop: %+v", list.Timers)
	}
	advance(time.Hour)
	if again, err := d.StopTimer(ctx, tm.ID); err != nil || !reflect.DeepEqual(again.Draft, dr) {
		t.Errorf("stopping twice: %+v %v", again, err)
	}
	if _, err := d.ResumeTimer(ctx, tm.ID); err == nil {
		t.Error("a stopped timer was resumed")
	}

	// Saving the draft goes through the ordinary session create and keeps both stamps.
	body, _ := json.Marshal(dr)
	saveBody := fields(t, string(body))
	saveBody["timer_id"] = json.RawMessage(fmt.Sprint(tm.ID))
	s, err := d.CreateSession(ctx, saveBody)
	if err != nil {
		t.Fatal(err)
	}
	if s.StartedAt == nil || s.EndedAt == nil || *s.EndedAt != dr.EndedAt || s.TaskID == nil {
		t.Errorf("saved session = %+v", s)
	}
	if list, _ := d.ListTimers(ctx); len(list.Timers) != 0 {
		t.Errorf("saving the draft did not retire the timer: %+v", list.Timers)
	}
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-11-16","started_at":"2026-11-16T10:00:00Z","ended_at":"2026-11-16T09:00:00Z"}`, tk.ID))); err == nil {
		t.Error("ended_at before started_at accepted")
	}
	// A cancelled draft is just not saved.
	cancelled := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	if err := d.DiscardTimer(ctx, cancelled.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := d.ListTimers(ctx); len(list.Timers) != 0 || count(t, d, "session") != 1 {
		t.Errorf("after discard: %+v", list.Timers)
	}
}

// anyEq lets a test compare hours that are rounded to 4 places.
func anyEq(want float64) float64 {
	return float64(int64(want*10000+0.5)) / 10000
}

func TestOnlyOneTimerRunsAtATime(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	fakeClock(t, clock0)
	a := mustArea(t, d, "Home", "HM")
	t1, t2 := mustTask(t, d, a.ID, "One"), mustTask(t, d, a.ID, "Two")
	first := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, t1.ID))

	_, err := d.StartTimer(ctx, fields(t, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, t2.ID)))
	var conflict *ConflictError
	if !errors.As(err, &conflict) {
		t.Fatalf("second start: %v", err)
	}
	list, ok := conflict.Current.(*TimerList)
	if !ok || len(list.Timers) != 1 || list.Timers[0].ID != first.ID || list.Conflict {
		t.Errorf("409 carries %+v", conflict.Current)
	}
	// Pausing the first lets another start; resuming the first then conflicts.
	d.PauseTimer(ctx, first.ID)
	second := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, t2.ID))
	if _, err := d.ResumeTimer(ctx, first.ID); !errors.As(err, &conflict) {
		t.Errorf("resume while another runs: %v", err)
	}
	if _, err := d.StartTimer(ctx, fields(t, `{"day":"2026-11-16"}`)); err == nil {
		t.Error("a timer on nothing was started")
	}
	if _, err := d.StartTimer(ctx, fields(t, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d,"day_item_id":1}`, t1.ID))); err == nil {
		t.Error("task_id and day_item_id together accepted")
	}
	_ = second
}

// Elapsed time comes from the stored timestamps: close the database, "restart"
// hours later, and it carries on.
func TestTimerSurvivesRestart(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "r.db")
	advance := fakeClock(t, clock0)
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Long job")
	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))
	advance(10 * time.Minute)
	d.PauseTimer(ctx, tm.ID)
	advance(time.Hour)
	d.ResumeTimer(ctx, tm.ID)
	d.Close()

	advance(3 * time.Hour) // the device was off
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	list, err := d.ListTimers(ctx)
	if err != nil || len(list.Timers) != 1 || list.Conflict {
		t.Fatalf("after restart: %+v %v", list, err)
	}
	if got := list.Timers[0]; !got.Running || got.ElapsedS != 600+3*3600 {
		t.Errorf("elapsed after restart = %d, want %d", got.ElapsedS, 600+3*3600)
	}
}

// Two devices each started a timer while offline: after sync both are kept and
// the list says so.
func TestTwoRunningTimersAfterSyncFlagAConflict(t *testing.T) {
	ctx := context.Background()
	fakeClock(t, clock0)
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	mustTask(t, srv, home.ID, "Shared")
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	sTask, pTask := taskByTitle(t, srv, "Shared"), taskByTitle(t, phone, "Shared")

	startOn(t, srv, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, sTask.ID))
	startOn(t, phone, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, pTask.ID))
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		list, err := d.ListTimers(ctx)
		if err != nil || len(list.Timers) != 2 || !list.Conflict {
			t.Errorf("%s: %+v %v, want two running timers and conflict", name, list, err)
		}
	}
	// Stopping one ends the conflict, on both devices after sync.
	list, _ := srv.ListTimers(ctx)
	if err := srv.DiscardTimer(ctx, list.Timers[0].ID); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if l, _ := phone.ListTimers(ctx); len(l.Timers) != 1 || l.Conflict {
		t.Errorf("phone after one stopped: %+v", l)
	}
}

func TestEventCompletesWhenASessionIsSavedAndSurvivesReschedule(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	advance := fakeClock(t, clock0)
	a := mustArea(t, d, "Personal", "PER")
	ev, err := d.AddDayItem(ctx, "2026-11-16", fields(t, fmt.Sprintf(`{"title":"Dentist","planned_min":45,"area_id":%d}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if ev.Done || ev.SessionCount != 0 {
		t.Fatalf("a new event is done: %+v", ev)
	}

	// A manual session: no start or end.
	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"day_item_id":%d,"hours":0.75,"logged_for":"2026-11-16"}`, ev.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if s.Kind != "event" || s.Label == nil || *s.Label != "Dentist" || s.StartedAt != nil || s.EndedAt != nil || *s.DayItemID != ev.ID {
		t.Errorf("manual event session = %+v", s)
	}
	if ev, _ = d.GetDayItem(ctx, ev.ID); !ev.Done || ev.SessionCount != 1 || ev.LoggedH != 0.75 {
		t.Errorf("event after its session: %+v", ev)
	}
	day, _ := d.GetDay(ctx, "2026-11-16")
	if len(day.Items) != 1 || !day.Items[0].Done {
		t.Errorf("the day lists the event: %+v", day.Items)
	}

	// Rescheduling and deleting the event keep the session.
	if _, err := d.PatchDayItem(ctx, ev.ID, fields(t, `{"day":"2026-11-20"}`)); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteDayItem(ctx, ev.ID); err != nil {
		t.Fatal(err)
	}
	if got, err := d.GetSession(ctx, s.ID); err != nil || *got.DayItemID != ev.ID {
		t.Errorf("session after the event was deleted: %+v %v", got, err)
	}

	// An event started from the planner: the timer captures start and end.
	ev2, _ := d.AddDayItem(ctx, "2026-11-16", fields(t, fmt.Sprintf(`{"title":"Gym","planned_min":60,"area_id":%d}`, a.ID)))
	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","day_item_id":%d}`, ev2.ID))
	if tm.Kind != "event" || tm.Title != "Gym" {
		t.Errorf("event timer = %+v", tm)
	}
	advance(50 * time.Minute)
	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	dr := stopped.Draft
	if dr.Kind != "event" || *dr.DayItemID != ev2.ID || *dr.Label != "Gym" || dr.StartedAt == "" || dr.EndedAt == "" {
		t.Fatalf("event draft = %+v", dr)
	}
	body, _ := json.Marshal(dr)
	saved, err := d.CreateSession(ctx, fields(t, string(body)))
	if err != nil {
		t.Fatal(err)
	}
	if saved.StartedAt == nil || saved.EndedAt == nil {
		t.Errorf("timer session lost its stamps: %+v", saved)
	}
	if got, _ := d.GetDayItem(ctx, ev2.ID); !got.Done {
		t.Error("saving the timer's session did not complete the event")
	}
	// Deleting the session un-completes it: completion is only ever derived.
	if err := d.DeleteSession(ctx, saved.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := d.GetDayItem(ctx, ev2.ID); got.Done {
		t.Error("event stayed done after its session was deleted")
	}
	if _, err := d.CreateSession(ctx, fields(t, `{"day_item_id":9999,"hours":1,"logged_for":"2026-11-16","energy_type_id":1}`)); err == nil {
		t.Error("a session for a missing plan item was accepted")
	}
}
