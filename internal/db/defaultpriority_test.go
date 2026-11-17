package db

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestDefaultPriority(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	create := func(extra string) *Task {
		task, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"x","area_id":%d%s}`, a.ID, extra)))
		if err != nil {
			t.Fatal(err)
		}
		return task
	}
	// No setting: the built-in weight-1.0 priority (Normal, id 2).
	if p := create("").PriorityID; p == nil || *p != 2 {
		t.Errorf("no setting: priority = %v, want 2", p)
	}
	// Explicit values win, including an explicit none.
	if p := create(`,"priority_id":3`).PriorityID; p == nil || *p != 3 {
		t.Errorf("explicit: priority = %v, want 3", p)
	}
	if p := create(`,"priority_id":null`).PriorityID; p != nil {
		t.Errorf("explicit null: priority = %v, want none", p)
	}
	// Choose High.
	if err := d.PutSetting(ctx, "default_priority", json.RawMessage(`{"priority_id":3}`)); err != nil {
		t.Fatal(err)
	}
	if p := create("").PriorityID; p == nil || *p != 3 {
		t.Errorf("High: priority = %v, want 3", p)
	}
	// None.
	if err := d.PutSetting(ctx, "default_priority", json.RawMessage(`{"priority_id":null}`)); err != nil {
		t.Fatal(err)
	}
	if p := create("").PriorityID; p != nil {
		t.Errorf("None: priority = %v, want none", p)
	}
	// A priority that does not exist is refused.
	if err := d.PutSetting(ctx, "default_priority", json.RawMessage(`{"priority_id":999}`)); err == nil {
		t.Error("accepted a missing priority")
	}
	// A chosen priority that is later deleted counts as none.
	p, err := d.CreatePriority(ctx, fields(t, `{"name":"Urgent","weight":2}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := d.PutSetting(ctx, "default_priority", json.RawMessage(fmt.Sprintf(`{"priority_id":%d}`, p.ID))); err != nil {
		t.Fatal(err)
	}
	if err := d.DeletePriority(ctx, p.ID, nil, true); err != nil {
		t.Fatal(err)
	}
	if got := create("").PriorityID; got != nil {
		t.Errorf("deleted default: priority = %v, want none", got)
	}
}
