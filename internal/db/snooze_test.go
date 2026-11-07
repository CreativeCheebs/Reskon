package db

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Seeded statuses: 1 Backlog, 2 To do (todo), 3 In progress, 4 Done,
// 5 Cancelled.
func TestSnooze(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	today := time.Now().Format("2006-01-02")

	got, err := d.Snooze(ctx, tk.ID, 3, false, today)
	if err != nil {
		t.Fatal(err)
	}
	want := time.Now().AddDate(0, 0, 3).Format("2006-01-02")
	if !got.Snoozed || got.SnoozedUntil == nil || *got.SnoozedUntil != want {
		t.Fatalf("snoozed = %v until %v, want true until %s", got.Snoozed, got.SnoozedUntil, want)
	}
	if got.UpdatedAt == tk.UpdatedAt {
		t.Error("snooze did not bump updated_at")
	}
	// Status and transitions are untouched.
	if got.StatusID != tk.StatusID {
		t.Errorf("status changed to %d", got.StatusID)
	}
	if tr, _ := d.Transitions(ctx, tk.ID); len(tr) != 1 {
		t.Errorf("snooze wrote transitions: %d", len(tr))
	}

	// Past the cap (default 30) and negative are refused.
	if _, err := d.Snooze(ctx, tk.ID, 31, false, today); err == nil {
		t.Error("31 days accepted with the default cap")
	}
	if _, err := d.Snooze(ctx, tk.ID, -1, false, today); err == nil {
		t.Error("negative days accepted")
	}
	if err := d.PutSetting(ctx, "snooze", json.RawMessage(`{"max_days":60}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Snooze(ctx, tk.ID, 45, false, today); err != nil {
		t.Errorf("45 days with a 60 day cap: %v", err)
	}
	if err := d.PutSetting(ctx, "snooze", json.RawMessage(`{"max_days":0}`)); err == nil {
		t.Error("max_days 0 accepted")
	}

	// A snooze date of today or earlier is not snoozed.
	d.Exec(`UPDATE task SET snoozed_until = ? WHERE id = ?`, today, tk.ID)
	if g, _ := d.GetTask(ctx, tk.ID); g.Snoozed {
		t.Error("snoozed until today still counts as snoozed")
	}

	// 0 wakes.
	d.Snooze(ctx, tk.ID, 5, false, today)
	if got, err = d.Snooze(ctx, tk.ID, 0, false, today); err != nil || got.Snoozed || got.SnoozedUntil != nil {
		t.Errorf("wake: %v snoozed=%v until=%v", err, got.Snoozed, got.SnoozedUntil)
	}

	// Moving into done clears the snooze; done tasks cannot be snoozed.
	d.Snooze(ctx, tk.ID, 5, false, today)
	if got, err = d.Move(ctx, tk.ID, MoveRequest{StatusID: 4, Today: today}); err != nil || got.SnoozedUntil != nil {
		t.Errorf("into done: %v until=%v", err, got.SnoozedUntil)
	}
	if _, err := d.Snooze(ctx, tk.ID, 2, false, today); err == nil {
		t.Error("done task snoozed")
	}
	// In progress can be snoozed, and a move between open statuses keeps it.
	d.Move(ctx, tk.ID, MoveRequest{StatusID: 3, Today: today})
	if _, err := d.Snooze(ctx, tk.ID, 2, false, today); err != nil {
		t.Errorf("in progress: %v", err)
	}
	if got, _ = d.Move(ctx, tk.ID, MoveRequest{StatusID: 2, Today: today}); !got.Snoozed {
		t.Error("move to To do woke the task")
	}
}

// Deleting a status moves its tasks like any other move would: a task that
// lands in Done wakes from its snooze.
func TestDeleteStatusIntoDoneWakesSnoozedTasks(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	today := time.Now().Format("2006-01-02")
	review, err := d.CreateStatus(ctx, fields(t, `{"name":"Review","category_id":2}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: review.ID, Today: today}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Snooze(ctx, tk.ID, 5, false, today); err != nil {
		t.Fatal(err)
	}
	done := int64(4)
	if err := d.DeleteStatus(ctx, review.ID, &done); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetTask(ctx, tk.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Snoozed || got.SnoozedUntil != nil {
		t.Errorf("a task moved to Done by a status delete is still snoozed until %v", got.SnoozedUntil)
	}
}
