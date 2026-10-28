package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"testing"
)

func fields(t *testing.T, js string) Fields {
	t.Helper()
	var f Fields
	if err := json.Unmarshal([]byte(js), &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func mustArea(t *testing.T, d *DB, name, prefix string) *Area {
	t.Helper()
	a, err := d.CreateArea(context.Background(), fields(t, fmt.Sprintf(`{"name":%q,"key_prefix":%q,"default_energy_type_id":1}`, name, prefix)))
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func mustTask(t *testing.T, d *DB, areaID int64, title string) *Task {
	t.Helper()
	tk, err := d.CreateTask(context.Background(), fields(t, fmt.Sprintf(`{"title":%q,"area_id":%d}`, title, areaID)))
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

func TestKeyAssignmentSequentialPerArea(t *testing.T) {
	d := openTest(t)
	per := mustArea(t, d, "Personal", "PER")
	om := mustArea(t, d, "Main job", "OM2")

	if k := mustTask(t, d, per.ID, "a").Key; k != "PER-1" {
		t.Errorf("got %s, want PER-1", k)
	}
	if k := mustTask(t, d, per.ID, "b").Key; k != "PER-2" {
		t.Errorf("got %s, want PER-2", k)
	}
	if k := mustTask(t, d, om.ID, "c").Key; k != "OM2-1" {
		t.Errorf("got %s, want OM2-1", k)
	}
	// A deleted task's key is never reused.
	third := mustTask(t, d, per.ID, "c")
	d.DeleteTask(context.Background(), third.ID)
	if k := mustTask(t, d, per.ID, "d").Key; k != "PER-4" {
		t.Errorf("after delete got %s, want PER-4", k)
	}
}

func TestKeyAssignmentConcurrent(t *testing.T) {
	d := openTest(t)
	per := mustArea(t, d, "Personal", "PER")
	const n = 40
	keys := make([]string, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tk, err := d.CreateTask(context.Background(), Fields{
				"title":   json.RawMessage(`"t"`),
				"area_id": json.RawMessage(fmt.Sprint(per.ID)),
			})
			errs[i] = err
			if err == nil {
				keys[i] = tk.Key
			}
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	sort.Strings(keys)
	seen := map[string]bool{}
	for _, k := range keys {
		if seen[k] {
			t.Fatalf("duplicate key %s", k)
		}
		seen[k] = true
	}
	for i := 1; i <= n; i++ {
		if !seen[fmt.Sprintf("PER-%d", i)] {
			t.Errorf("missing PER-%d", i)
		}
	}
}

func TestPatchTaskConflict(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	f := fields(t, fmt.Sprintf(`{"title":"y","updated_at":%q}`, tk.UpdatedAt))
	if _, err := d.PatchTask(ctx, tk.ID, f); err != nil {
		t.Fatal(err)
	}
	f = fields(t, fmt.Sprintf(`{"title":"z","updated_at":%q}`, tk.UpdatedAt))
	_, err := d.PatchTask(ctx, tk.ID, f)
	conf, ok := err.(*ConflictError)
	if !ok {
		t.Fatalf("want ConflictError, got %v", err)
	}
	if cur := conf.Current.(*Task); cur.Title != "y" {
		t.Errorf("conflict carries title %q, want y", cur.Title)
	}
}

func TestNewTaskTakesAreaDefaultEnergyType(t *testing.T) {
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	if tk.EnergyTypeID == nil || *tk.EnergyTypeID != 1 {
		t.Errorf("energy_type_id = %v, want 1", tk.EnergyTypeID)
	}
}
