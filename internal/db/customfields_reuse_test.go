package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// A deleted field's key can be used again: the old field and its values go
// for good, and the new field starts empty, with its own index.
func TestCustomFieldKeyCanBeReused(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	f, err := d.CreateCustomField(ctx, fields(t, `{"entity":"task","key":"customer","label":"Customer","type":"text"}`))
	if err != nil {
		t.Fatal(err)
	}
	tk := mustTask(t, d, mustArea(t, d, "Home", "HM").ID, "Quote")
	if _, err := d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"custom":{"customer":"Acme"},"updated_at":%q}`, tk.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteCustomField(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateCustomField(ctx, fields(t, `{"entity":"task","key":"customer","label":"Client","type":"text"}`)); err != nil {
		t.Fatalf("key not reusable: %v", err)
	}
	got, _ := d.GetTask(ctx, tk.ID)
	if string(got.Custom) != "{}" {
		t.Errorf("old value kept: %s", got.Custom)
	}
	var plan string
	d.QueryRowContext(ctx, `EXPLAIN QUERY PLAN SELECT id FROM task WHERE `+customExpr("customer")+` = 'x'`).Scan(new(int), new(int), new(int), &plan)
	if plan == "" || !strings.Contains(plan, "cf_task_customer") {
		t.Errorf("filter does not use the field's index: %q", plan)
	}
}
