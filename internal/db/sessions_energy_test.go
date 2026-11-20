package db

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// A session with two energy types: each part takes its share of the hours
// and earns hours x share x rate x its own intensity. Totals add back up to
// the whole session, by-type figures split it.
func TestSessionWithSeveralEnergyTypes(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

	s, err := d.CreateSession(ctx, fields(t, `{"kind":"event","label":"Studied with friends","hours":2,"logged_for":"2026-10-30",
		"energies":[{"energy_type_id":4,"share":0.5,"difficulty":3},{"energy_type_id":5,"share":0.5,"difficulty":1}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if s.EnergyTypeID != 4 || s.Difficulty == nil || *s.Difficulty != 3 {
		t.Errorf("session's own type/intensity should be the first part's: %d %v", s.EnergyTypeID, s.Difficulty)
	}
	if s.Points == nil || *s.Points != 4 {
		t.Fatalf("session points = %v, want 4 (2h x .5 x 3 + 2h x .5 x 1)", s.Points)
	}
	if len(s.Energies) != 2 || s.Energies[0].Hours != 1 || *s.Energies[0].Points != 3 || *s.Energies[1].Points != 1 {
		t.Fatalf("parts = %+v", s.Energies)
	}

	byType := func(metric string) map[string]float64 {
		res, err := d.Metric(ctx, MetricQuery{Metric: metric, Group: "energy_type", From: "2026-10-30", To: "2026-10-30"}, now)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]float64{}
		for _, p := range res.Points {
			out[p.Key] = p.Value
		}
		out["total"] = res.Total
		return out
	}
	if h := byType("session_hours"); h["4"] != 1 || h["5"] != 1 || h["total"] != 2 {
		t.Errorf("hours by type = %v, want 1 + 1 = 2", h)
	}
	if p := byType("points"); p["4"] != 3 || p["5"] != 1 || p["total"] != 4 {
		t.Errorf("points by type = %v, want 3 + 1 = 4", p)
	}
	res, _ := d.Metric(ctx, MetricQuery{Metric: "session_count", From: "2026-10-30", To: "2026-10-30"}, now)
	if res.Total != 1 {
		t.Errorf("session count = %v, want 1", res.Total)
	}
	day, err := d.GetDay(ctx, "2026-10-30")
	if err != nil {
		t.Fatal(err)
	}
	if len(day.Totals) != 2 || day.Totals[0].Hours != 1 || day.Totals[1].Hours != 1 {
		t.Errorf("day totals = %+v", day.Totals)
	}
	list, _ := d.ListSessions(ctx, SessionQuery{EnergyTypes: []int64{5}})
	if len(list) != 1 || len(list[0].Energies) != 2 {
		t.Errorf("filter by the second type: %d sessions", len(list))
	}

	// Shares must add up to 100%.
	if _, err := d.CreateSession(ctx, fields(t, `{"hours":1,"logged_for":"2026-10-30",
		"energies":[{"energy_type_id":4,"share":0.7},{"energy_type_id":5,"share":0.7}]}`)); err == nil {
		t.Error("shares over 100% were accepted")
	}

	// New shares and intensities recalculate: 2h x .25 x 1 + 2h x .75 x 1.
	s, err = d.PatchSession(ctx, s.ID, fields(t, `{"energies":[{"energy_type_id":4,"share":0.25,"difficulty":1},{"energy_type_id":1,"share":0.75,"difficulty":1}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if *s.Points != 2 || len(s.Energies) != 2 || *s.Energies[0].Points != 0.5 || *s.Energies[1].Points != 1.5 {
		t.Errorf("after edit: points %v, parts %+v", *s.Points, s.Energies)
	}

	// Intensity set in bulk applies to every part, and recalculates.
	if _, err := d.BulkSessions(ctx, []int64{s.ID}, fields(t, `{"difficulty":5}`), false, nil); err != nil {
		t.Fatal(err)
	}
	s, _ = d.GetSession(ctx, s.ID)
	if *s.Energies[1].Difficulty != 5 || *s.Points != 10 {
		t.Errorf("bulk intensity: points %v, parts %+v", *s.Points, s.Energies)
	}

	// Back to one type: the parts go, points are 2h x intensity 2.
	s, err = d.PatchSession(ctx, s.ID, fields(t, fmt.Sprintf(`{"energies":[{"energy_type_id":%d,"share":1,"difficulty":2}]}`, 2)))
	if err != nil {
		t.Fatal(err)
	}
	if s.EnergyTypeID != 2 || len(s.Energies) != 1 || s.Energies[0].Share != 1 || *s.Points != 4 || *s.PointsNow != 4 {
		t.Errorf("single again: type %d, parts %+v, points %v", s.EnergyTypeID, s.Energies, *s.Points)
	}
	var rows int
	d.QueryRow(`SELECT COUNT(*) FROM session_energy WHERE session_id = ?`, s.ID).Scan(&rows)
	if rows != 0 {
		t.Errorf("one-type session still has %d part rows", rows)
	}
}
