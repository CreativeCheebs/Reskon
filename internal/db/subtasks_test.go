package db

import (
	"context"
	"fmt"
	"testing"
)

func TestSubtaskLevels(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	epic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"demo","area_id":%d,"type":"epic"}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	parent, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"build app","area_id":%d,"epic_id":%d}`, a.ID, epic.ID)))
	if err != nil {
		t.Fatal(err)
	}
	// No area given: the subtask takes its parent's.
	sub, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"install flutter","parent_id":%d}`, parent.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if sub.AreaID != a.ID || sub.ParentID == nil || *sub.ParentID != parent.ID || sub.EpicID != nil {
		t.Errorf("subtask = area %d parent %v epic %v", sub.AreaID, sub.ParentID, sub.EpicID)
	}
	sub2, _ := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"compile","parent_id":%d}`, parent.ID)))
	d.Move(ctx, sub.ID, MoveRequest{StatusID: 4}) // done

	got, _ := d.GetTask(ctx, parent.ID)
	if got.SubtaskCount != 2 || got.SubtaskDone != 1 {
		t.Errorf("parent counts = %d/%d, want 1 of 2", got.SubtaskDone, got.SubtaskCount)
	}
	list, err := d.ListSubtasks(ctx, parent.ID)
	if err != nil || len(list) != 2 {
		t.Fatalf("ListSubtasks = %d, %v", len(list), err)
	}

	refused := func(what, body string, id int64) {
		t.Helper()
		var err error
		if id == 0 {
			_, err = d.CreateTask(ctx, fields(t, body))
		} else {
			cur, _ := d.GetTask(ctx, id)
			_, err = d.PatchTask(ctx, id, fields(t, fmt.Sprintf(`{%s,"updated_at":%q}`, body, cur.UpdatedAt)))
		}
		if err == nil {
			t.Errorf("%s was accepted", what)
		}
	}
	refused("subtask of a subtask", fmt.Sprintf(`{"title":"x","parent_id":%d}`, sub2.ID), 0)
	refused("subtask of an epic", fmt.Sprintf(`{"title":"x","parent_id":%d}`, epic.ID), 0)
	refused("epic as a subtask", fmt.Sprintf(`{"title":"x","area_id":%d,"type":"epic","parent_id":%d}`, a.ID, parent.ID), 0)
	refused("subtask with its own epic", fmt.Sprintf(`"epic_id":%d`, epic.ID), sub2.ID)
	refused("parent made an epic", `"type":"epic"`, parent.ID)
	other := mustTask(t, d, a.ID, "other")
	refused("parent made a subtask", fmt.Sprintf(`"parent_id":%d`, other.ID), parent.ID)
	refused("own parent", fmt.Sprintf(`"parent_id":%d`, other.ID), other.ID)

	// Deleting the parent leaves its subtasks as ordinary tasks.
	if err := d.DeleteTask(ctx, parent.ID); err != nil {
		t.Fatal(err)
	}
	if s, _ := d.GetTask(ctx, sub2.ID); s.ParentID != nil {
		t.Error("subtask kept a deleted parent")
	}
}

func TestViewsHideSubtasksUnlessAsked(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	parent := mustTask(t, d, a.ID, "parent")
	if _, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"child","parent_id":%d}`, parent.ID))); err != nil {
		t.Fatal(err)
	}
	for filter, want := range map[string]int{`{}`: 1, `{"subtasks":true}`: 2} {
		tasks, err := d.ListTasksForView(ctx, viewWith(t, d, filter), "")
		if err != nil || len(tasks) != want {
			t.Errorf("%s: %d tasks, %v; want %d", filter, len(tasks), err, want)
		}
	}
}
