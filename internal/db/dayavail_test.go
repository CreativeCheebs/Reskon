package db

import (
	"context"
	"encoding/json"
	"testing"
)

// All seven weekday values, an override for one day, and "not set".
func TestAvailableTimePerWeekdayAndOverride(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	// 2026-11-15 is a Sunday.
	days := []string{"2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"}

	// Nothing set: no available time, and never over.
	a := mustArea(t, d, "Home", "HM")
	big := mustTask(t, d, a.ID, "Big")
	setEstimate(t, d, big, 20)
	bigLine := planTask(t, d, days[0], big.ID)
	d.PatchDayItem(ctx, bigLine.ID, fields(t, `{"planned_min":1200}`))
	day, err := d.GetDay(ctx, days[0])
	if err != nil {
		t.Fatal(err)
	}
	if day.PlanTotals.AvailableMin != nil || day.PlanTotals.AvailableFrom != nil || day.PlanTotals.Over {
		t.Errorf("unset available time: %+v", day.PlanTotals)
	}

	if err := d.PutSetting(ctx, "planner_available", json.RawMessage(
		`{"sun":60,"mon":120,"tue":180,"wed":240,"thu":300,"fri":360,"sat":420}`)); err != nil {
		t.Fatal(err)
	}
	for i, day := range days {
		got, err := d.GetDay(ctx, day)
		if err != nil {
			t.Fatal(err)
		}
		want := int64(60 * (i + 1))
		if got.PlanTotals.AvailableMin == nil || *got.PlanTotals.AvailableMin != want || *got.PlanTotals.AvailableFrom != "weekday" {
			t.Errorf("%s: available = %v %v, want %d from the weekday", day, got.PlanTotals.AvailableMin, got.PlanTotals.AvailableFrom, want)
		}
	}
	// The Sunday has 20h planned against 60 min: over.
	if day, _ = d.GetDay(ctx, days[0]); !day.PlanTotals.Over {
		t.Errorf("20h planned against 1h available is not over: %+v", day.PlanTotals)
	}

	// An override wins for its day only, and null goes back to the weekday.
	got, err := d.PatchDay(ctx, days[0], fields(t, `{"available_min":1440}`))
	if err != nil {
		t.Fatal(err)
	}
	if *got.Plan.AvailableMin != 1440 || *got.PlanTotals.AvailableMin != 1440 || *got.PlanTotals.AvailableFrom != "day" || got.PlanTotals.Over {
		t.Errorf("override: plan %v totals %+v", got.Plan.AvailableMin, got.PlanTotals)
	}
	if mon, _ := d.GetDay(ctx, days[1]); *mon.PlanTotals.AvailableMin != 120 {
		t.Errorf("the override leaked to Monday: %+v", mon.PlanTotals)
	}
	got, _ = d.PatchDay(ctx, days[0], fields(t, `{"available_min":null}`))
	if got.Plan.AvailableMin != nil || *got.PlanTotals.AvailableMin != 60 {
		t.Errorf("override cleared: %+v", got.PlanTotals)
	}
	// An override of 0 is a set value (a day off), not "not set".
	got, _ = d.PatchDay(ctx, days[1], fields(t, `{"available_min":0}`))
	if got.PlanTotals.AvailableMin == nil || *got.PlanTotals.AvailableMin != 0 {
		t.Errorf("zero override: %+v", got.PlanTotals)
	}

	// A weekday left out is not set; bad values are refused.
	if err := d.PutSetting(ctx, "planner_available", json.RawMessage(`{"mon":null,"fri":90}`)); err != nil {
		t.Fatal(err)
	}
	if sun, _ := d.GetDay(ctx, days[0]); sun.PlanTotals.AvailableMin != nil || sun.PlanTotals.Over {
		t.Errorf("a weekday not in the setting: %+v", sun.PlanTotals)
	}
	if fri, _ := d.GetDay(ctx, days[5]); *fri.PlanTotals.AvailableMin != 90 {
		t.Errorf("friday: %+v", fri.PlanTotals)
	}
	for _, bad := range []string{`{"funday":5}`, `{"mon":-1}`, `{"mon":1441}`, `[1,2]`} {
		if err := d.PutSetting(ctx, "planner_available", json.RawMessage(bad)); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
	if _, err := d.PatchDay(ctx, days[0], fields(t, `{"available_min":2000}`)); err == nil {
		t.Error("available_min 2000 accepted")
	}
}

func TestDaySummariesForTheCalendar(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "One")
	setEstimate(t, d, tk, 2)
	line := planTask(t, d, "2026-11-16", tk.ID)
	d.PatchDayItem(ctx, line.ID, fields(t, `{"planned_min":120}`))
	d.AddDayItem(ctx, "2026-11-16", fields(t, `{"title":"Gym","planned_min":90}`))
	logHours(t, d, tk.ID, "2026-11-16", 1)
	d.PutSetting(ctx, "planner_available", json.RawMessage(`{"mon":180}`))
	d.PatchDay(ctx, "2026-11-17", fields(t, `{"available_min":30}`))

	rows, err := d.DaySummaries(ctx, "2026-11-15", "2026-11-17")
	if err != nil || len(rows) != 3 {
		t.Fatalf("%v %+v", err, rows)
	}
	sun, mon, tue := rows[0], rows[1], rows[2]
	if sun.Items != 0 || sun.AvailableMin != nil || sun.Over {
		t.Errorf("sunday = %+v", sun)
	}
	if mon.Items != 2 || mon.PlannedMin != 210 || mon.LoggedMin != 60 || *mon.AvailableMin != 180 || !mon.Over {
		t.Errorf("monday = %+v", mon)
	}
	if tue.Items != 0 || *tue.AvailableMin != 30 || *tue.AvailableFrom != "day" || tue.Over {
		t.Errorf("tuesday = %+v", tue)
	}
	if _, err := d.DaySummaries(ctx, "2026-11-17", "2026-11-15"); err == nil {
		t.Error("backwards range accepted")
	}
	if _, err := d.DaySummaries(ctx, "2026-01-01", "2026-12-31"); err == nil {
		t.Error("a year accepted")
	}
}
