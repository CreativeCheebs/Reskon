package db

import (
	"context"
	"fmt"
	"testing"
)

func TestRankWeight(t *testing.T) {
	w := []float64{1, 0.5, 0.25, 0.25}
	for rank, want := range map[int]float64{1: 1, 2: 0.5, 3: 0.25, 4: 0.25, 5: 0.25, 0: 0} {
		if got := rankWeight(w, rank); got != want {
			t.Errorf("rank %d: got %v, want %v", rank, got, want)
		}
	}
	if got := rankWeight(nil, 2); got != 0.5 {
		t.Errorf("default weights rank 2: got %v", got)
	}
}

func TestSessionInheritsTaskEnergyAndWeightsSubtypes(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2") // default energy 1 (Engineering)
	tk := mustTask(t, d, a.ID, "stm32 demo")
	// Change the task's energy type so inheritance is visibly from the task.
	d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"energy_type_id":3,"updated_at":%q}`, tk.UpdatedAt)))
	coding, _ := d.CreateSubtype(ctx, fields(t, `{"name":"coding","energy_type_id":1}`))
	debug, _ := d.CreateSubtype(ctx, fields(t, `{"name":"debugging","energy_type_id":1}`))

	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(
		`{"task_id":%d,"hours":2.5,"logged_for":"2026-10-28","subtypes":[%d,%d]}`, tk.ID, coding.ID, debug.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if s.EnergyTypeID != 3 {
		t.Errorf("energy type = %d, want 3 (from task)", s.EnergyTypeID)
	}
	if s.AreaID == nil || *s.AreaID != a.ID {
		t.Errorf("area not inherited from task")
	}
	if len(s.Subtypes) != 2 || s.Subtypes[0].WeightedH != 2.5 || s.Subtypes[1].WeightedH != 1.25 {
		t.Errorf("subtype weighting wrong: %+v", s.Subtypes)
	}
	got, _ := d.GetTask(ctx, tk.ID)
	if got.LoggedH != 2.5 {
		t.Errorf("task logged_h = %v, want 2.5", got.LoggedH)
	}

	// Explicit energy type wins over inheritance.
	s2, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-10-28","energy_type_id":2}`, tk.ID)))
	if err != nil || s2.EnergyTypeID != 2 {
		t.Errorf("override: %v %v", err, s2)
	}
}

func TestEventSessionNeedsEnergyTypeWithoutArea(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	_, err := d.CreateSession(ctx, fields(t, `{"kind":"event","label":"Bath","hours":0.5,"logged_for":"2026-10-28"}`))
	if _, ok := err.(*InvalidError); !ok {
		t.Errorf("want InvalidError, got %v", err)
	}
	s, err := d.CreateSession(ctx, fields(t, `{"kind":"event","label":"Gaming","hours":2,"logged_for":"2026-10-28","energy_type_id":5}`))
	if err != nil || s.TaskID != nil || s.Kind != "event" {
		t.Errorf("event session: %v %+v", err, s)
	}
}

func TestDayKeepsSpendAndRestoreApart(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	d.CreateSession(ctx, fields(t, `{"hours":3,"logged_for":"2026-10-28","energy_type_id":1}`))
	d.CreateSession(ctx, fields(t, `{"hours":2,"logged_for":"2026-10-28","energy_type_id":5}`))
	d.CreateSession(ctx, fields(t, `{"hours":9,"logged_for":"2026-10-27","energy_type_id":1}`))
	day, err := d.GetDay(ctx, "2026-10-28")
	if err != nil {
		t.Fatal(err)
	}
	if len(day.Spend) != 1 || day.Spend[0].Hours != 3 {
		t.Errorf("spend = %+v", day.Spend)
	}
	if len(day.Restore) != 1 || day.Restore[0].Hours != 2 {
		t.Errorf("restore = %+v", day.Restore)
	}
}
