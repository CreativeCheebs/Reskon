package db

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// A task can be created already snoozed: snooze_until is a local date,
// checked with the same rules as Snooze, and only applies on create.
func TestCreateTaskSnoozeUntil(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	create := func(extra string) (*Task, error) {
		return d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"x","area_id":%d,"today":"2026-11-18"%s}`, a.ID, extra)))
	}

	// Valid date: snoozed in the same step, status and transitions as usual.
	tk, err := create(`,"snooze_until":"2026-11-25"`)
	if err != nil {
		t.Fatal(err)
	}
	if tk.SnoozedUntil == nil || *tk.SnoozedUntil != "2026-11-25" {
		t.Fatalf("snoozed_until = %v, want 2026-11-25", tk.SnoozedUntil)
	}
	if tr, _ := d.Transitions(ctx, tk.ID); len(tr) != 1 {
		t.Errorf("transitions = %d, want 1", len(tr))
	}

	// Absent and null: not snoozed.
	for _, extra := range []string{"", `,"snooze_until":null`} {
		tk, err := create(extra)
		if err != nil {
			t.Fatal(err)
		}
		if tk.SnoozedUntil != nil || tk.Snoozed {
			t.Errorf("%q: snoozed = %v until %v, want not snoozed", extra, tk.Snoozed, tk.SnoozedUntil)
		}
	}

	// Today, the past, junk and too far are refused, and no task is left behind.
	before := count(t, d, "task")
	for name, extra := range map[string]string{
		"today":    `,"snooze_until":"2026-11-18"`,
		"past":     `,"snooze_until":"2026-11-10"`,
		"junk":     `,"snooze_until":"next week"`,
		"number":   `,"snooze_until":5`,
		"max_days": `,"snooze_until":"2027-12-31"`,
	} {
		if _, err := create(extra); err == nil {
			t.Errorf("%s: want an error", name)
		} else if _, ok := err.(*InvalidError); !ok {
			t.Errorf("%s: error %v is not an InvalidError", name, err)
		}
	}
	// A done task cannot be snoozed.
	if _, err := create(`,"status_id":4,"snooze_until":"2026-11-25"`); err == nil || !strings.Contains(err.Error(), "open tasks") {
		t.Errorf("done + snooze: %v", err)
	}
	if n := count(t, d, "task"); n != before {
		t.Errorf("refused creates left %d tasks behind", n-before)
	}
}

func TestCreateTaskSnoozeUntilHonoursMaxDays(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	if err := d.PutSetting(ctx, "snooze", json.RawMessage(`{"max_days":5}`)); err != nil {
		t.Fatal(err)
	}
	create := func(until string) error {
		_, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"x","area_id":%d,"today":"2026-11-18","snooze_until":%q}`, a.ID, until)))
		return err
	}
	if err := create("2026-11-23"); err != nil {
		t.Errorf("5 days: %v", err)
	}
	if err := create("2026-11-24"); err == nil {
		t.Error("6 days with max_days 5: want an error")
	}
}
