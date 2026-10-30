package db

import (
	"context"
	"fmt"
	"testing"
)

func TestDayPlanReadoutAndEditingPastDays(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Main job", "OM2")
	d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"area_id":%d,"energy_type_id":1,"hours":11,"logged_for":"2026-10-20"}`, a.ID)))
	d.CreateSession(ctx, fields(t, `{"energy_type_id":2,"hours":2,"logged_for":"2026-10-20"}`))
	d.CreateSession(ctx, fields(t, `{"energy_type_id":4,"hours":6.5,"kind":"event","logged_for":"2026-10-20"}`))
	d.CreateState(ctx, fields(t, `{"name":"Unwell","kind":"debuff","severity":2,"started_on":"2026-10-20"}`), "2026-10-20")

	day, err := d.PatchDay(ctx, "2026-10-20", fields(t, `{"focus":["Main job"],"ceilings":{"1":10,"2":5}}`))
	if err != nil {
		t.Fatal(err)
	}
	if !day.Plan.Saved || len(day.Readout) != 2 {
		t.Fatalf("readout = %+v", day.Readout)
	}
	eng, phys := day.Readout[0], day.Readout[1]
	if *eng.Planned != 10 || eng.Spent != 11 || !eng.Over {
		t.Errorf("Engineering = %+v, want planned 10, spent 11, over", eng)
	}
	if phys.Over {
		t.Errorf("Physical under plan flagged over: %+v", phys)
	}
	if len(day.Restore) != 1 || day.Restore[0].Hours != 6.5 {
		t.Errorf("restore = %+v, want Rest 6.5 alone", day.Restore)
	}
	if len(day.InForce) != 1 || day.InForce[0].DaysRunning != 1 {
		t.Errorf("in force = %+v, want Unwell day 1", day.InForce)
	}
	// Restore has no ceiling.
	if _, err := d.PatchDay(ctx, "2026-10-20", fields(t, `{"ceilings":{"4":8}}`)); err == nil {
		t.Error("a ceiling for a restore energy type was accepted")
	}
	// Answering the evening question does not freeze the day: it can be
	// changed, and the plan edited, afterwards.
	if _, err := d.PatchDay(ctx, "2026-10-20", fields(t, `{"ceiling_feedback":"too_high"}`)); err != nil {
		t.Fatal(err)
	}
	day, err = d.PatchDay(ctx, "2026-10-20", fields(t, `{"ceilings":{"1":12},"ceiling_feedback":"about_right"}`))
	if err != nil || *day.Readout[0].Planned != 12 || day.Readout[0].Over || *day.Plan.CeilingFeedback != "about_right" {
		t.Errorf("editing a past day after feedback: %+v %v", day, err)
	}
	if _, err := d.PatchDay(ctx, "2026-10-20", fields(t, `{"ceiling_feedback":"bad"}`)); err == nil {
		t.Error("unknown feedback accepted")
	}
}

func TestCeilingSuggestionTooHighHoldsThenCreepsBack(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if _, err := d.PatchDay(ctx, "2026-10-10", fields(t, `{"focus":["Main job"],"ceilings":{"1":10,"2":4}}`)); err != nil {
		t.Fatal(err)
	}
	// With no feedback, the suggestion is the last plan carried forward.
	day, _ := d.GetDay(ctx, "2026-10-11")
	if day.Suggested.Ceilings["1"] != 10 || string(day.Suggested.Focus) != `["Main job"]` || day.Plan.Saved {
		t.Errorf("carried forward = %+v", day.Suggested)
	}
	d.PatchDay(ctx, "2026-10-10", fields(t, `{"ceiling_feedback":"too_high"}`))
	want := map[string]float64{
		"2026-10-11": 8, "2026-10-12": 8, "2026-10-13": 8, // ~20% lower, held three days
		"2026-10-14": 8.5, "2026-10-15": 9, "2026-10-16": 9.5, "2026-10-17": 10, // creeping back
		"2026-10-18": 10,
	}
	for date, w := range want {
		day, err := d.GetDay(ctx, date)
		if err != nil {
			t.Fatal(err)
		}
		if got := day.Suggested.Ceilings["1"]; got != w {
			t.Errorf("%s: suggestion %v, want %v", date, got, w)
		}
	}
	day, _ = d.GetDay(ctx, "2026-10-12")
	if h := day.Suggested.Held["1"]; h.Since != "2026-10-10" || h.Day != 2 || h.From != 10 {
		t.Errorf("held note = %+v", h)
	}
	// A later "about right" ends the hold.
	d.PatchDay(ctx, "2026-10-11", fields(t, `{"ceilings":{"1":8},"ceiling_feedback":"about_right"}`))
	day, _ = d.GetDay(ctx, "2026-10-12")
	if day.Suggested.Ceilings["1"] != 8 || len(day.Suggested.Held) != 0 {
		t.Errorf("after about right: %+v", day.Suggested)
	}
}
