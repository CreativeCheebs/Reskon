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
