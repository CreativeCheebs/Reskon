package db

import (
	"context"
	"testing"
)

func TestDeleteStatusReassignsWithOneTransitionEach(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	blocked, err := d.CreateStatus(ctx, fields(t, `{"name":"Blocked","category_id":2,"alert_after_days":21}`))
	if err != nil {
		t.Fatal(err)
	}
	var ids []int64
	for _, title := range []string{"a", "b", "c"} {
		tk := mustTask(t, d, a.ID, title)
		if _, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: blocked.ID}); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, tk.ID)
	}
	untouched := mustTask(t, d, a.ID, "stays in To do")
	before := map[int64]string{}
	for _, id := range ids {
		tk, _ := d.GetTask(ctx, id)
		before[id] = tk.UpdatedAt
	}

	// Without a target: refused, nothing changes.
	if _, ok := d.DeleteStatus(ctx, blocked.ID, nil).(*ConflictError); !ok {
		t.Fatal("delete with tasks and no reassign_to should conflict")
	}

	const inProgress = int64(3)
	to := inProgress
	if err := d.DeleteStatus(ctx, blocked.ID, &to); err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		tk, err := d.GetTask(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if tk.StatusID != inProgress {
			t.Errorf("task %d status = %d, want %d", id, tk.StatusID, inProgress)
		}
		if tk.UpdatedAt == before[id] {
			t.Errorf("task %d updated_at not bumped", id)
		}
		trs, _ := d.Transitions(ctx, id)
		n := 0
		for _, tr := range trs {
			if tr.Reason == "status_deleted" {
				n++
				if *tr.FromStatusID != blocked.ID || tr.ToStatusID != inProgress {
					t.Errorf("transition %+v has wrong endpoints", tr)
				}
			}
		}
		if n != 1 {
			t.Errorf("task %d has %d status_deleted transitions, want 1", id, n)
		}
		if tk.TimeInStatusH > 0.01 {
			t.Errorf("time in status did not restart: %v h", tk.TimeInStatusH)
		}
	}
	if trs, _ := d.Transitions(ctx, untouched.ID); len(trs) != 1 {
		t.Errorf("unaffected task got %d transitions, want 1", len(trs))
	}
	if _, err := d.GetStatus(ctx, blocked.ID); err != ErrNotFound {
		t.Errorf("deleted status still readable: %v", err)
	}
	// The name is free again.
	if _, err := d.CreateStatus(ctx, fields(t, `{"name":"Blocked","category_id":2}`)); err != nil {
		t.Errorf("recreating name: %v", err)
	}
}

func TestDeleteEmptyStatusNeedsNoTarget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	s, _ := d.CreateStatus(ctx, fields(t, `{"name":"Review","category_id":2}`))
	if err := d.DeleteStatus(ctx, s.ID, nil); err != nil {
		t.Fatal(err)
	}
}

func TestBuiltinsCannotBeDeleted(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if _, ok := d.DeleteStatus(ctx, 1, nil).(*ConflictError); !ok {
		t.Error("builtin status deleted")
	}
	if _, ok := d.DeletePriority(ctx, 1, nil, true).(*ConflictError); !ok {
		t.Error("builtin priority deleted")
	}
}

func TestDeletePriorityReassignOrClear(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	urgent, _ := d.CreatePriority(ctx, fields(t, `{"name":"Urgent","weight":2}`))
	tk := mustTask(t, d, a.ID, "x")
	d.PatchTask(ctx, tk.ID, Fields{"priority_id": rawInt(urgent.ID), "updated_at": rawStr(tk.UpdatedAt)})

	if _, ok := d.DeletePriority(ctx, urgent.ID, nil, false).(*ConflictError); !ok {
		t.Fatal("expected conflict without reassign or clear")
	}
	if err := d.DeletePriority(ctx, urgent.ID, nil, true); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetTask(ctx, tk.ID)
	if got.PriorityID != nil {
		t.Errorf("priority not cleared: %v", *got.PriorityID)
	}
}
