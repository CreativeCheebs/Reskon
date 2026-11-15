package db

import (
	"context"
	"testing"
)

// An app data widget names an app, one of its data widgets and that feed's
// range and group, nothing else; its chart type is one some shape suits
// (which one suits this widget is the API's check), and it is never run as
// a metric.
func TestAppDataWidget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	f := func(s string) Fields { return fields(t, s) }
	dash := itoa(all[0].ID)
	w, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"app_data","viz":"checklist","query":{"app":"habits","widget":"today_list"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if w.Source != SourceAppData || w.Viz != VizChecklist {
		t.Fatalf("saved %+v", w)
	}
	if _, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"app_data","viz":"bar","query":{"app":"habits","widget":"last_days","range":"30d","group":"week"}}`)); err != nil {
		t.Errorf("ranged: %v", err)
	}
	for _, bad := range []string{
		`{"dashboard_id":` + dash + `,"source":"app_data","query":{"app":"habits","widget":"today_list"}}`, // no viz
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"pie","query":{"app":"habits","widget":"today_list"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"page","query":{"app":"habits","widget":"today_list"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"bar","query":{"app":"habits"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"bar","query":{"app":"habits","widget":"x","range":"all"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"bar","query":{"app":"habits","widget":"x","group":"Week!"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"bar","query":{"app":"habits","widget":"x","metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"viz":"checklist","query":{"metric":"points"}}`,
	} {
		if _, err := d.CreateWidget(ctx, f(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"query":{"metric":"points"}}`)); err == nil {
		t.Error("an app data widget took a metric query")
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"source":"metric"}`)); err == nil {
		t.Error("an app data widget became a metric")
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("an app data widget ran as a metric")
	}
	for _, c := range []struct{ rng, from, to string }{{"", "2026-11-09", "2026-11-15"}, {"today", "2026-11-15", "2026-11-15"}, {"month", "2026-11-01", "2026-11-15"}, {"1y", "2025-11-16", "2026-11-15"}} {
		if from, to, err := ResolveAppRange(c.rng, "2026-11-15"); err != nil || from != c.from || to != c.to {
			t.Errorf("%q = %s..%s %v", c.rng, from, to, err)
		}
	}
	if _, _, err := ResolveAppRange("all", "2026-11-15"); err == nil {
		t.Error(`"all" resolved for an app`)
	}
}
