package db

import (
	"context"
	"fmt"
	"testing"
)

func suggestTexts(t *testing.T, d *DB, q string) []CaptureSuggestion {
	t.Helper()
	out, err := d.CaptureSuggest(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestCaptureSuggestRankingAndSources(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	mk := func(title, custom string) *Task {
		task, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":%q,"area_id":%d%s}`, title, a.ID, custom)))
		if err != nil {
			t.Fatal(err)
		}
		return task
	}
	open := mk("Order NVR drive", "")
	mk("Reorder staples", "")
	done := mk("Order cake", "")
	if _, err := d.Exec(`UPDATE task SET status_id = (SELECT s.id FROM status s JOIN status_category c ON c.id = s.category_id WHERE c.behaviour = 'done' LIMIT 1) WHERE id = ?`, done.ID); err != nil {
		t.Fatal(err)
	}
	mk("Buy milk", `,"custom":{"_capture":{"raw":"order milk from the shop"}}`)
	for i := 0; i < 2; i++ {
		if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"energy_type_id":1,"hours":1,"logged_for":"2026-10-20","custom":{"_capture":{"raw":"ordered the NVR drive 1h"}}}`, open.ID))); err != nil {
			t.Fatal(err)
		}
	}

	got := suggestTexts(t, d, "order")
	if len(got) != 5 {
		t.Fatalf("got %+v", got)
	}
	// Starts-with first, open before done; the session line was captured twice, so it leads the lines.
	if got[0].Text != "ordered the NVR drive 1h" || got[0].Kind != "session" || got[0].TaskID == nil || *got[0].TaskID != open.ID {
		t.Errorf("first = %+v", got[0])
	}
	// The next two tie on repeats, so either order is fine.
	byText := map[string]CaptureSuggestion{got[1].Text: got[1], got[2].Text: got[2]}
	if task, ok := byText["Order NVR drive"]; !ok || task.Kind != "task" || task.TaskID == nil || *task.TaskID != open.ID {
		t.Errorf("task suggestion missing: %+v", got)
	}
	if line, ok := byText["order milk from the shop"]; !ok || line.Kind != "history" {
		t.Errorf("history suggestion missing: %+v", got)
	}
	if got[3].Text != "Order cake" {
		t.Errorf("a done task ranks after open ones: %+v", got)
	}
	// "Reorder staples" only has the word inside: last tier.
	if got[4].Text != "Reorder staples" {
		t.Errorf("last = %+v", got[4])
	}
	// Several words must all match.
	if g := suggestTexts(t, d, "nvr order"); len(g) != 2 {
		t.Errorf("two words: %+v", g)
	}
}

func TestCaptureSuggestEmptyShortAndLimit(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	for i := 0; i < 12; i++ {
		if _, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Fix thing %d","area_id":%d}`, i, a.ID))); err != nil {
			t.Fatal(err)
		}
	}
	for _, q := range []string{"", " ", "f"} {
		if got := suggestTexts(t, d, q); got == nil || len(got) != 0 {
			t.Errorf("%q: want empty non-nil list, got %v", q, got)
		}
	}
	if got := suggestTexts(t, d, "fix"); len(got) != 8 {
		t.Errorf("limit: %d", len(got))
	}
	if got := suggestTexts(t, d, "50%_"); len(got) != 0 {
		t.Errorf("odd characters: %v", got)
	}
}

// Capture and suggesting never write.
func TestCaptureSuggestAndLookupsWriteNothing(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	if _, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Fix login","area_id":%d}`, a.ID))); err != nil {
		t.Fatal(err)
	}
	tables := []string{"task", "session", "setting", "status_transition"}
	snap := func() []int {
		var n []int
		for _, tb := range tables {
			n = append(n, count(t, d, tb))
		}
		return n
	}
	before := snap()
	suggestTexts(t, d, "fix")
	if _, err := d.CaptureLookups(ctx, "fix login 2 hours", 8); err != nil {
		t.Fatal(err)
	}
	after := snap()
	for i := range before {
		if before[i] != after[i] {
			t.Errorf("%s changed: %d -> %d", tables[i], before[i], after[i])
		}
	}
}
