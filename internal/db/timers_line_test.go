package db

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

// A timer started on a task line takes the task from the line; its draft
// carries both ids and saves as a session linked to the line.
func TestTimerOnATaskLine(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	advance := fakeClock(t, clock0)
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Write")
	line := planTask(t, d, "2026-11-16", tk.ID)

	tm := startOn(t, d, fmt.Sprintf(`{"day":"2026-11-16","day_item_id":%d}`, line.ID))
	if tm.Kind != "task" || tm.TaskID == nil || *tm.TaskID != tk.ID || tm.DayItemID == nil || *tm.DayItemID != line.ID {
		t.Fatalf("timer = %+v", tm)
	}
	advance(30 * time.Minute)
	stopped, err := d.StopTimer(ctx, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	dr := stopped.Draft
	if dr.TaskID == nil || *dr.TaskID != tk.ID || dr.DayItemID == nil || *dr.DayItemID != line.ID || dr.Kind != "task" {
		t.Fatalf("draft = %+v", dr)
	}
	body, _ := json.Marshal(dr)
	f := fields(t, string(body))
	f["timer_id"] = json.RawMessage(fmt.Sprint(tm.ID))
	s, err := d.CreateSession(ctx, f)
	if err != nil || s.DayItemID == nil || *s.DayItemID != line.ID || *s.TaskID != tk.ID || s.Kind != "task" {
		t.Fatalf("saved = %+v %v", s, err)
	}
	// Starting on the task alone still works.
	if _, err := d.StartTimer(ctx, fields(t, fmt.Sprintf(`{"day":"2026-11-16","task_id":%d}`, tk.ID))); err != nil {
		t.Error(err)
	}
}
