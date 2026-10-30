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

func TestDayTotalsEveryTypeInOneList(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	d.CreateSession(ctx, fields(t, `{"hours":3,"logged_for":"2026-10-28","energy_type_id":1}`))
	d.CreateSession(ctx, fields(t, `{"hours":2,"logged_for":"2026-10-28","energy_type_id":5}`))
	d.CreateSession(ctx, fields(t, `{"hours":9,"logged_for":"2026-10-27","energy_type_id":1}`))
	day, err := d.GetDay(ctx, "2026-10-28")
	if err != nil {
		t.Fatal(err)
	}
	if len(day.Totals) != 2 || day.Totals[0].Hours != 3 || day.Totals[1].Hours != 2 {
		t.Errorf("totals = %+v", day.Totals)
	}
}

// Points are stored when a session is logged and never recalculated by an
// edit; a rate or formula change applies only from then on.
func TestSessionPointsStoredAtLogTime(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	tk := mustTask(t, d, a.ID, "hard thing")
	d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"difficulty":3,"updated_at":%q}`, tk.UpdatedAt)))

	own, _ := d.CreateSession(ctx, fields(t, `{"energy_type_id":1,"hours":2,"difficulty":4,"logged_for":"2026-10-28"}`))
	fromTask, _ := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1.5,"logged_for":"2026-10-28"}`, tk.ID)))
	plain, _ := d.CreateSession(ctx, fields(t, `{"energy_type_id":2,"hours":2.5,"logged_for":"2026-10-28"}`))
	rest, _ := d.CreateSession(ctx, fields(t, `{"energy_type_id":4,"hours":7,"kind":"event","logged_for":"2026-10-28"}`))
	for _, c := range []struct {
		s    *Session
		want any
	}{{own, 8.0}, {fromTask, 4.5}, {plain, 2.5}, {rest, 7.0}} {
		if got := deref(c.s.Points); got != c.want {
			t.Errorf("session %d points = %v, want %v", c.s.ID, got, c.want)
		}
	}

	// Editing hours or difficulty leaves the stored points alone.
	edited, err := d.PatchSession(ctx, own.ID, fields(t, `{"hours":3,"difficulty":5}`))
	if err != nil {
		t.Fatal(err)
	}
	if *edited.Points != 8 {
		t.Errorf("points after edit = %v, want 8 (unchanged)", *edited.Points)
	}
	// Points can be set by hand.
	if edited, _ = d.PatchSession(ctx, own.ID, fields(t, `{"points":15}`)); *edited.Points != 15 {
		t.Errorf("points set by hand = %v, want 15", *edited.Points)
	}
	if _, err := d.PatchSession(ctx, own.ID, fields(t, `{"points":-1}`)); err == nil {
		t.Error("negative points accepted")
	}
	// A formula change (here: the task's difficulty) applies to new sessions only.
	cur, _ := d.GetTask(ctx, tk.ID)
	d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"difficulty":5,"updated_at":%q}`, cur.UpdatedAt)))
	old, _ := d.GetSession(ctx, fromTask.ID)
	fresh, _ := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1.5,"logged_for":"2026-10-29"}`, tk.ID)))
	if *old.Points != 4.5 || *fresh.Points != 7.5 {
		t.Errorf("old/new points = %v/%v, want 4.5/7.5", *old.Points, *fresh.Points)
	}
	// Every type has a rate: points = hours x rate x difficulty. A new rate
	// applies to sessions logged after it.
	if _, err := d.PatchEnergyType(ctx, 4, fields(t, `{"points_per_hour":0.5}`)); err != nil {
		t.Fatal(err)
	}
	sleep, _ := d.CreateSession(ctx, fields(t, `{"energy_type_id":4,"hours":8,"difficulty":2,"kind":"event","logged_for":"2026-10-29"}`))
	if *sleep.Points != 8 {
		t.Errorf("rate 0.5 x 8h x difficulty 2 = %v, want 8", *sleep.Points)
	}
	if again, _ := d.GetSession(ctx, rest.ID); *again.Points != 7 {
		t.Errorf("old Rest session changed with the rate: %v", *again.Points)
	}
	if _, err := d.PatchEnergyType(ctx, 4, fields(t, `{"points_per_hour":-1}`)); err == nil {
		t.Error("negative rate accepted")
	}
}
