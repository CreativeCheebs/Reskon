package db

import (
	"context"
	"testing"
	"time"
)

func TestLinksBlockAndSnooze(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	first := mustTask(t, d, a.ID, "design")
	second := mustTask(t, d, a.ID, "build")
	third := mustTask(t, d, a.ID, "ship")
	today := time.Now().Format("2006-01-02")

	got, err := d.AddLink(ctx, first.ID, second.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Blocked || len(got.BlockedBy) != 1 || got.BlockedBy[0].ID != first.ID {
		t.Errorf("blocked = %v by %v", got.Blocked, got.BlockedBy)
	}
	if f, _ := d.GetTask(ctx, first.ID); f.Blocked || len(f.Blocks) != 1 {
		t.Errorf("blocker: blocked %v, blocks %v", f.Blocked, f.Blocks)
	}
	if _, err := d.AddLink(ctx, second.ID, third.ID); err != nil {
		t.Fatal(err)
	}

	// Refused: itself, a repeat, and a loop through second.
	if _, err := d.AddLink(ctx, first.ID, first.ID); err == nil {
		t.Error("self link accepted")
	}
	if _, err := d.AddLink(ctx, first.ID, second.ID); err == nil {
		t.Error("duplicate link accepted")
	}
	if _, err := d.AddLink(ctx, third.ID, first.ID); err == nil {
		t.Error("loop accepted")
	}

	// Snooze until unblocked: hidden while first is open, back once it is done.
	if _, err := d.Snooze(ctx, first.ID, 0, true, today); err == nil {
		t.Error("unblocked task snoozed until unblocked")
	}
	if got, err = d.Snooze(ctx, second.ID, 0, true, today); err != nil || !got.Snoozed {
		t.Fatalf("snooze until unblocked: %v snoozed=%v", err, got.Snoozed)
	}
	if _, err := d.Move(ctx, first.ID, MoveRequest{StatusID: 4, Today: today}); err != nil {
		t.Fatal(err)
	}
	if got, _ = d.GetTask(ctx, second.ID); got.Blocked || got.Snoozed || got.SnoozeUntilUnblocked {
		t.Errorf("after blocker done: blocked %v snoozed %v flag %v", got.Blocked, got.Snoozed, got.SnoozeUntilUnblocked)
	}

	// Removing a link unblocks too.
	link := got.Blocks[0].LinkID
	if err := d.RemoveLink(ctx, link); err != nil {
		t.Fatal(err)
	}
	if tk, _ := d.GetTask(ctx, third.ID); tk.Blocked || len(tk.BlockedBy) != 0 {
		t.Errorf("after unlink: blocked %v by %v", tk.Blocked, tk.BlockedBy)
	}
	if err := d.RemoveLink(ctx, link); err != ErrNotFound {
		t.Errorf("second remove = %v", err)
	}
}
