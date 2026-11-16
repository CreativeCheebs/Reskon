package db

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestDefaultDashboardsAndLayout(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, x := range all {
		names = append(names, x.Name)
	}
	if strings.Join(names, "|") != "Home|Today|This month|The year" {
		t.Fatalf("dashboards = %v", names)
	}
	// Every seeded metric widget's query is one the metrics API accepts and
	// runs (Home's board names a view and is checked in home_test.go).
	for _, x := range all {
		if len(x.Widgets) == 0 {
			t.Errorf("%s has no widgets", x.Name)
		}
		for _, w := range x.Widgets {
			if w.Source != SourceMetric {
				continue
			}
			q, err := ParseWidgetQuery(w.Query)
			if err != nil {
				t.Fatalf("%s/%v: %v", x.Name, *w.Title, err)
			}
			if _, err := d.Metric(ctx, q, time.Now()); err != nil {
				t.Errorf("%s/%s: %v", x.Name, *w.Title, err)
			}
		}
	}

	// A bulk layout save moves widgets and sets the phone order to the
	// grid's reading order.
	month := all[2]
	a, b := month.Widgets[0], month.Widgets[1]
	got, err := d.SaveLayout(ctx, month.ID, []LayoutItem{{ID: a.ID, X: 0, Y: 600, W: 6, H: 3}, {ID: b.ID, X: 0, Y: 0, W: 12, H: 4}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Widgets[0].ID != b.ID || got.Widgets[len(got.Widgets)-1].ID != a.ID {
		t.Errorf("order after layout = first %d last %d", got.Widgets[0].ID, got.Widgets[len(got.Widgets)-1].ID)
	}
	if _, err := d.SaveLayout(ctx, month.ID, []LayoutItem{{ID: a.ID, X: 8, Y: 0, W: 6, H: 3}}); err == nil {
		t.Error("widget past the 12th column accepted")
	}
	if _, err := d.SaveLayout(ctx, all[0].ID, []LayoutItem{{ID: a.ID, W: 4, H: 4}}); err == nil {
		t.Error("widget from another dashboard accepted")
	}

	// Widgets are checked against the registry when saved.
	if _, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"session_hours","split":"energy_type"}}`)); err != nil {
		t.Errorf("valid widget refused: %v", err)
	}
	for _, bad := range []string{
		`{"dashboard_id":1,"viz":"donut","query":{"metric":"points"}}`,
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"balance"}}`,
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"points","group":"status"}}`,
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"points","filters":{"status":"Done"}}}`,
	} {
		if _, err := d.CreateWidget(ctx, fields(t, bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	// Built-in dashboards can be deleted.
	if err := d.DeleteDashboard(ctx, all[2].ID); err != nil {
		t.Error(err)
	}
}

// Seeded widgets are metrics; the planned sources are refused until they
// are built, an unknown one always is (migration 019), and an app page
// widget's shape is refused for a metric query.
func TestWidgetSource(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range all {
		for _, w := range x.Widgets {
			// Only Home's board is not a metric.
			if w.Source != SourceMetric && !(x.Name == "Home" && w.Source == SourceView) {
				t.Errorf("seeded widget %d has source %q", w.ID, w.Source)
			}
		}
	}
	base := func(source string) Fields {
		f := Fields{}
		f["dashboard_id"] = []byte(itoa(all[0].ID))
		f["viz"] = []byte(`"number"`)
		f["query"] = []byte(`{"metric":"points","range":"today"}`)
		if source != "" {
			f["source"] = []byte(`"` + source + `"`)
		}
		return f
	}
	w, err := d.CreateWidget(ctx, base(""))
	if err != nil || w.Source != SourceMetric {
		t.Fatalf("no source given: %+v, %v", w, err)
	}
	if _, err := d.CreateWidget(ctx, base("metric")); err != nil {
		t.Fatalf("source metric: %v", err)
	}
	for _, s := range []string{"view", "app_data", "app_page", "nonsense"} { // each needs its own query and viz, so the metric ones fail
		if _, err := d.CreateWidget(ctx, base(s)); err == nil {
			t.Errorf("source %q accepted", s)
		}
	}
	if _, err := d.PatchWidget(ctx, w.ID, Fields{"source": []byte(`"app_page"`)}); err == nil {
		t.Error("patched to a source that is not built")
	}

	// A widget of another source (say, from a newer device) is not run as a metric.
	if _, err := d.ExecContext(ctx, `UPDATE widget SET source = 'app_page' WHERE id = ?`, w.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("an app_page widget ran as a metric")
	}
}

// An app page widget names an app and one of its pages, nothing else; its
// viz is always "page", and a widget keeps the source it was made with.
func TestAppPageWidget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	f := func(s string) Fields { return fields(t, s) }
	dash := itoa(all[0].ID)
	w, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"app_page","title":"Today's habits","query":{"app":"habits","widget":"today"},"w":4,"h":4}`))
	if err != nil {
		t.Fatal(err)
	}
	if w.Source != SourceAppPage || w.Viz != VizPage || string(w.Query) != `{"app":"habits","widget":"today"}` {
		t.Fatalf("saved %+v", w)
	}
	for _, bad := range []string{
		`{"dashboard_id":` + dash + `,"source":"app_page","query":{"app":"habits"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_page","query":{"app":"Habits!","widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_page","query":{"app":"habits","widget":"today","metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_page","query":{"app":1,"widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_page","viz":"bar","query":{"app":"habits","widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"viz":"page","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"viz":"bar","query":{"app":"habits","widget":"today"}}`,
	} {
		if _, err := d.CreateWidget(ctx, f(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	// A patch's query is checked against the widget's own source.
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"query":{"app":"habits","widget":"last_days"},"title":"Other"}`)); err != nil {
		t.Errorf("patch query: %v", err)
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"query":{"metric":"points","range":"today"}}`)); err == nil {
		t.Error("an app page widget took a metric query")
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"source":"metric","viz":"number","query":{"metric":"points","range":"today"}}`)); err == nil {
		t.Error("an app page widget became a metric")
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"source":"app_page","x":2}`)); err != nil {
		t.Errorf("same source again: %v", err)
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("an app page widget ran as a metric")
	}
	// A widget of a source not built here (from a newer device) can still be
	// moved, but not changed.
	if _, err := d.ExecContext(ctx, `UPDATE widget SET source = 'journal' WHERE id = ?`, w.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"y":3}`)); err != nil {
		t.Errorf("move: %v", err)
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"source":"journal","x":2}`)); err != nil {
		t.Errorf("move, repeating its own source: %v", err)
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"query":{"metric":"points"}}`)); err == nil {
		t.Error("changed the query of a widget of an unbuilt source")
	}
}
