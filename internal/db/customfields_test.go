package db

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestCustomFieldValidationPerType(t *testing.T) {
	defs := map[string]CustomField{
		"text":   {Key: "text", Type: "text"},
		"int":    {Key: "int", Type: "int"},
		"real":   {Key: "real", Type: "real"},
		"bool":   {Key: "bool", Type: "bool"},
		"date":   {Key: "date", Type: "date"},
		"select": {Key: "select", Type: "select", Options: json.RawMessage(`["a","b"]`)},
	}
	cases := []struct {
		key, value string
		ok         bool
	}{
		{"text", `"hello"`, true}, {"text", `3`, false},
		{"int", `3`, true}, {"int", `3.5`, false}, {"int", `"3"`, false},
		{"real", `3.5`, true}, {"real", `"x"`, false},
		{"bool", `true`, true}, {"bool", `1`, false},
		{"date", `"2026-11-04"`, true}, {"date", `"2026-11-4"`, false}, {"date", `"04/11/2026"`, false},
		{"date", `"2026-02-30"`, false}, {"date", `"2026-11-04T10:00:00Z"`, false},
		{"select", `"a"`, true}, {"select", `"c"`, false},
	}
	for _, c := range cases {
		err := validateCustomValue(defs[c.key], json.RawMessage(c.value))
		if (err == nil) != c.ok {
			t.Errorf("%s = %s: err=%v, want ok=%v", c.key, c.value, err, c.ok)
		}
	}
}

func TestCustomFieldsEndToEnd(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	f, err := d.CreateCustomField(ctx, fields(t, `{"entity":"task","key":"ship_by","label":"Ship by","type":"date"}`))
	if err != nil {
		t.Fatal(err)
	}
	x := mustTask(t, d, a.ID, "x")
	y := mustTask(t, d, a.ID, "y")

	// Bad date rejected; good one stored; unknown keys kept.
	if _, err := d.PatchTask(ctx, x.ID, fields(t, fmt.Sprintf(`{"custom":{"ship_by":"soon"},"updated_at":%q}`, x.UpdatedAt))); err == nil {
		t.Error("bad date accepted")
	}
	x, err = d.PatchTask(ctx, x.ID, fields(t, fmt.Sprintf(`{"custom":{"ship_by":"2026-11-04","mystery":42},"updated_at":%q}`, x.UpdatedAt)))
	if err != nil {
		t.Fatal(err)
	}
	// A later patch of another key keeps both.
	x, err = d.PatchTask(ctx, x.ID, fields(t, fmt.Sprintf(`{"custom":{"blocked_reason":"waiting"},"updated_at":%q}`, x.UpdatedAt)))
	if err != nil {
		t.Fatal(err)
	}
	var c map[string]any
	json.Unmarshal(x.Custom, &c)
	if c["ship_by"] != "2026-11-04" || c["mystery"] != float64(42) || c["blocked_reason"] != "waiting" {
		t.Errorf("custom = %v", c)
	}

	// Filter by it.
	tasks, err := d.ListTasksForView(ctx, viewWith(t, d, `{"custom":{"ship_by":{"gte":"2026-11-01","lte":"2026-11-30"}}}`), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0].ID != x.ID {
		t.Errorf("filter returned %d tasks", len(tasks))
	}
	_ = y

	// Type cannot change.
	if _, err := d.PatchCustomField(ctx, f.ID, fields(t, `{"type":"text"}`)); err == nil {
		t.Error("type change accepted")
	}
	// Deleting the definition keeps the data.
	if err := d.DeleteCustomField(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetTask(ctx, x.ID)
	json.Unmarshal(got.Custom, &c)
	if c["ship_by"] != "2026-11-04" {
		t.Errorf("data lost after definition delete: %v", c)
	}
	// With no definition, the key is no longer validated.
	if _, err := d.PatchTask(ctx, x.ID, fields(t, fmt.Sprintf(`{"custom":{"ship_by":"whenever"},"updated_at":%q}`, got.UpdatedAt))); err != nil {
		t.Errorf("undefined key rejected: %v", err)
	}
}

func TestSelectFieldNeedsOptions(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if _, err := d.CreateCustomField(ctx, fields(t, `{"entity":"task","key":"size","label":"Size","type":"select"}`)); err == nil {
		t.Error("select without options accepted")
	}
	f, err := d.CreateCustomField(ctx, fields(t, `{"entity":"task","key":"size","label":"Size","type":"select","options":["S","M","L"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(f.Options) != `["S","M","L"]` {
		t.Errorf("options = %s", f.Options)
	}
}
