package db

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// delTasks is d.DeleteTasks without the count, for the checks that only
// look at the error.
func delTasks(d *DB, ctx context.Context, ids []int64, withSubtasks bool) error {
	_, err := d.DeleteTasks(ctx, ids, withSubtasks)
	return err
}

func TestDeleteTasksIsAllOrNothing(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	one := mustTask(t, d, a.ID, "one")
	two := mustTask(t, d, a.ID, "two")
	keep := mustTask(t, d, a.ID, "keep")

	// An id that is not a task fails the whole call: nothing is deleted.
	if err := delTasks(d, ctx, []int64{one.ID, 9999}, false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a missing id gave %v, want not found", err)
	}
	if _, err := d.GetTask(ctx, one.ID); err != nil {
		t.Errorf("one was deleted although the call failed: %v", err)
	}
	if err := delTasks(d, ctx, nil, false); err == nil {
		t.Error("an empty selection was accepted")
	}

	// The same id twice counts once; the others stay.
	if err := delTasks(d, ctx, []int64{one.ID, two.ID, one.ID}, false); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{one.ID, two.ID} {
		if _, err := d.GetTask(ctx, id); !errors.Is(err, ErrNotFound) {
			t.Errorf("task %d still there: %v", id, err)
		}
	}
	if _, err := d.GetTask(ctx, keep.ID); err != nil {
		t.Errorf("an unselected task was deleted: %v", err)
	}
	// Already gone: deleting again fails and says so.
	if err := delTasks(d, ctx, []int64{one.ID}, false); !errors.Is(err, ErrNotFound) {
		t.Errorf("deleting twice gave %v, want not found", err)
	}
}

func TestDeletingAnEpicInABatchKeepsItsTasks(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	epic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"E","area_id":%d,"type":"epic"}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	child, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"child","area_id":%d,"epic_id":%d}`, a.ID, epic.ID)))
	if err != nil {
		t.Fatal(err)
	}
	parent := mustTask(t, d, a.ID, "parent")
	sub, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"sub","parent_id":%d}`, parent.ID)))
	if err != nil {
		t.Fatal(err)
	}
	other := mustTask(t, d, a.ID, "other")

	// The epic goes with another task; its child stays, without the epic.
	// The parent's subtask stays as an ordinary task.
	if err := delTasks(d, ctx, []int64{epic.ID, parent.ID, other.ID}, false); err != nil {
		t.Fatal(err)
	}
	c, err := d.GetTask(ctx, child.ID)
	if err != nil || c.EpicID != nil {
		t.Errorf("child after its epic was deleted: %+v, %v", c, err)
	}
	s, err := d.GetTask(ctx, sub.ID)
	if err != nil || s.ParentID != nil {
		t.Errorf("subtask after its parent was deleted: %+v, %v", s, err)
	}

	// With subtasks deleted too.
	p2 := mustTask(t, d, a.ID, "parent two")
	sub2, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"sub two","parent_id":%d}`, p2.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if err := delTasks(d, ctx, []int64{p2.ID}, true); err != nil {
		t.Fatal(err)
	}
	if _, err := d.GetTask(ctx, sub2.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("subtask kept although subtasks were to be deleted: %v", err)
	}
}

func TestDeleteTasksParentAndSubtaskTogether(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	// With subtasks going too, selecting a parent and its subtask works in
	// either order and counts both.
	for _, parentFirst := range []bool{true, false} {
		p := mustTask(t, d, a.ID, "p")
		s, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"s","parent_id":%d}`, p.ID)))
		if err != nil {
			t.Fatal(err)
		}
		ids := []int64{s.ID, p.ID}
		if parentFirst {
			ids = []int64{p.ID, s.ID}
		}
		n, err := d.DeleteTasks(ctx, ids, true)
		if err != nil || n != 2 {
			t.Fatalf("parent first %v: deleted %d, err %v", parentFirst, n, err)
		}
		for _, id := range ids {
			if _, err := d.GetTask(ctx, id); !errors.Is(err, ErrNotFound) {
				t.Errorf("task %d still there: %v", id, err)
			}
		}
	}
}

func TestDeleteTasksCountsDifferentTasksAndHasALimit(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	x := mustTask(t, d, a.ID, "x")
	if n, err := d.DeleteTasks(ctx, []int64{x.ID, x.ID}, false); err != nil || n != 1 {
		t.Errorf("a repeated id counted %d, err %v; want 1", n, err)
	}
	if _, err := d.DeleteTasks(ctx, make([]int64, maxBulkTasks+1), false); err == nil {
		t.Error("more than the limit was accepted")
	}
}
