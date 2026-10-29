package db

import (
	"context"
	"fmt"
	"testing"
)

func TestEpicRulesAndCounts(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	epic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"STM32 demo","area_id":%d,"type":"epic"}`, a.ID)))
	if err != nil || epic.Type != "epic" {
		t.Fatalf("create epic: %v %+v", err, epic)
	}
	child, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"bring-up","area_id":%d,"epic_id":%d}`, a.ID, epic.ID)))
	if err != nil {
		t.Fatal(err)
	}
	other := mustTask(t, d, a.ID, "other")
	d.Move(ctx, child.ID, MoveRequest{StatusID: 4}) // done

	got, _ := d.GetTask(ctx, epic.ID)
	if got.EpicTasks == nil || *got.EpicTasks != 1 || *got.EpicDone != 1 {
		t.Errorf("epic counts = %v/%v, want 1 done of 1", got.EpicDone, got.EpicTasks)
	}
	if c, _ := d.GetTask(ctx, child.ID); c.EpicTasks != nil {
		t.Error("ordinary task has epic counts")
	}

	// epic_id must point at an epic; an epic cannot have one.
	if _, err := d.PatchTask(ctx, other.ID, fields(t, fmt.Sprintf(`{"epic_id":%d,"updated_at":%q}`, child.ID, other.UpdatedAt))); err == nil {
		t.Error("task accepted a non-epic as its epic")
	}
	if _, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"x","area_id":%d,"type":"epic","epic_id":%d}`, a.ID, epic.ID))); err == nil {
		t.Error("epic accepted an epic")
	}
	// An epic with tasks cannot become a task.
	if _, err := d.PatchTask(ctx, epic.ID, fields(t, fmt.Sprintf(`{"type":"task","updated_at":%q}`, got.UpdatedAt))); err == nil {
		t.Error("epic with tasks turned into a task")
	}

	// Filters: by type, by epic, and "no epic".
	check := func(filter string, want ...string) {
		t.Helper()
		tasks, err := d.ListTasksForView(ctx, viewWith(t, d, filter), "")
		if err != nil {
			t.Fatal(err)
		}
		gt := titles(tasks)
		if len(gt) != len(want) {
			t.Errorf("%s: got %v, want %v", filter, gt, want)
		}
		for _, w := range want {
			if !gt[w] {
				t.Errorf("%s: missing %s", filter, w)
			}
		}
	}
	check(`{"types":["epic"]}`, "STM32 demo")
	check(fmt.Sprintf(`{"epics":[%d]}`, epic.ID), "bring-up")
	check(`{"epics":[0],"types":["task"]}`, "other")

	// Deleting the epic keeps its task, without an epic.
	if err := d.DeleteTask(ctx, epic.ID); err != nil {
		t.Fatal(err)
	}
	if c, _ := d.GetTask(ctx, child.ID); c.EpicID != nil {
		t.Errorf("child still points at deleted epic")
	}
}

func TestSearch(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	mustTask(t, d, a.ID, "Order NVR drive")
	x := mustTask(t, d, a.ID, "Clean devices")
	d.PatchTask(ctx, x.ID, fields(t, fmt.Sprintf(`{"description":"use 100%% alcohol","updated_at":%q}`, x.UpdatedAt)))
	v := viewWith(t, d, `{}`)
	cases := map[string]int{"nvr": 1, "NVR drive": 1, "PER-2": 1, "alcohol": 1, "100%": 1, "per": 2, "nvr clean": 0, "_": 0}
	for q, want := range cases {
		got, err := d.ListTasksForView(ctx, v, q)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != want {
			t.Errorf("search %q: %d results, want %d", q, len(got), want)
		}
	}
}
