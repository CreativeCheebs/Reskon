package db

import (
	"context"
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
	if len(all) != 3 || all[0].Name != "Today" || all[1].Name != "This month" || all[2].Name != "The year" {
		t.Fatalf("dashboards = %+v", all)
	}
	// Every seeded widget's query is one the metrics API accepts and runs.
	for _, x := range all {
		if len(x.Widgets) == 0 {
			t.Errorf("%s has no widgets", x.Name)
		}
		for _, w := range x.Widgets {
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
	month := all[1]
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

// Every widget so far is a metric; the planned sources are refused until
// they are built, and an unknown one always is (migration 019).
func TestWidgetSource(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range all {
		for _, w := range x.Widgets {
			if w.Source != SourceMetric {
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
	for _, s := range []string{"view", "app_data", "app_page", "nonsense"} {
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
