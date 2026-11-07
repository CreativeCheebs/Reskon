package db

import (
	"context"
	"fmt"
	"testing"
)

// The parent and epic checks adjust the fields (a subtask takes its parent's
// epic, an epic belongs to no epic). Those adjustments must reach the UPDATE.
func TestPatchTaskAppliesTheEpicClearsFromTheChecks(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Home", "HM")
	epic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"E","area_id":%d,"type":"epic"}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	parent := mustTask(t, d, a.ID, "Parent")

	// A task in an epic becomes a subtask of another task: it takes that task's epic (none).
	inEpic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"In epic","area_id":%d,"epic_id":%d}`, a.ID, epic.ID)))
	if err != nil {
		t.Fatal(err)
	}
	got, err := d.PatchTask(ctx, inEpic.ID, fields(t, fmt.Sprintf(`{"parent_id":%d,"updated_at":%q}`, parent.ID, inEpic.UpdatedAt)))
	if err != nil {
		t.Fatal(err)
	}
	if got.EpicID != nil {
		t.Errorf("subtask kept its own epic %d", *got.EpicID)
	}

	// A task in an epic turns into an epic: it must leave the old epic.
	other, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Becomes epic","area_id":%d,"epic_id":%d}`, a.ID, epic.ID)))
	if err != nil {
		t.Fatal(err)
	}
	got, err = d.PatchTask(ctx, other.ID, fields(t, fmt.Sprintf(`{"type":"epic","updated_at":%q}`, other.UpdatedAt)))
	if err != nil {
		t.Fatal(err)
	}
	if got.EpicID != nil {
		t.Errorf("an epic is still inside epic %d", *got.EpicID)
	}
}
