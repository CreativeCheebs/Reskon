package db

import (
	"strings"
	"testing"
)

// The combined metric answers points and hours as two series over the same
// days. Each series is the same figure the single metrics give; nothing is
// added across the two, and nothing divides one by the other.
func TestPointsAndHoursSeries(t *testing.T) {
	f := newMetricFixture(t)
	both := f.metric(t, MetricQuery{Metric: "points_and_hours", Group: "day", Range: "30d"})
	hours := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d"})
	points := f.metric(t, MetricQuery{Metric: "points", Group: "day", Range: "30d"})

	if len(both.Series) != 2 || both.Series[0].Key != "points" || both.Series[1].Key != "hours" {
		t.Fatalf("series = %+v, want points then hours", both.Series)
	}
	if both.Series[0].Unit != "points" || both.Series[1].Unit != "hours" {
		t.Errorf("series units = %q, %q", both.Series[0].Unit, both.Series[1].Unit)
	}
	got := pointMap(both)
	want := map[string]float64{}
	for k, v := range pointMap(points) {
		want[k+"points"] = v
	}
	for k, v := range pointMap(hours) {
		want[k+"hours"] = v
	}
	sameTotals(t, "combined", got, want)
	if len(both.Points) != 60 {
		t.Errorf("%d points, want 30 days x 2 series", len(both.Points))
	}
	if both.Total != 0 {
		t.Errorf("total = %v: points plus hours must not be added into one figure", both.Total)
	}
	if both.Series[0].Total != points.Total || both.Series[1].Total != hours.Total {
		t.Errorf("series totals %v, %v; want %v, %v", both.Series[0].Total, both.Series[1].Total, points.Total, hours.Total)
	}
	if both.Series[0].Average == nil || both.Series[1].Average == nil {
		t.Error("each series has its own average")
	}

	// It takes the filters and groupings the session metrics take, but no split.
	byType := f.metric(t, MetricQuery{Metric: "points_and_hours", Group: "energy_type", Range: "30d"})
	if len(byType.Series) != 2 {
		t.Errorf("by energy type: %d series", len(byType.Series))
	}
	if _, err := f.d.Metric(f.ctx, MetricQuery{Metric: "points_and_hours", Group: "day", Split: "area"}, metricNow); err == nil {
		t.Error("a split of the combined metric must be refused")
	}
}

func TestComboChartOnlyForTheCombinedMetric(t *testing.T) {
	f := newMetricFixture(t)
	for _, bad := range []string{
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"points_and_hours"}}`,
		`{"dashboard_id":1,"viz":"combo","query":{"metric":"points"}}`,
	} {
		if _, err := f.d.CreateWidget(f.ctx, fields(t, bad)); err == nil {
			t.Errorf("%s was accepted", bad)
		}
	}
	w, err := f.d.CreateWidget(f.ctx, fields(t, `{"dashboard_id":1,"viz":"combo","query":{"metric":"points_and_hours","group":"day"}}`))
	if err != nil {
		t.Fatal(err)
	}
	// Changing only the chart type or only the measure is checked against the other.
	if _, err := f.d.PatchWidget(f.ctx, w.ID, fields(t, `{"viz":"line"}`)); err == nil || !strings.Contains(err.Error(), "combo") {
		t.Errorf("patching viz: %v", err)
	}
	if _, err := f.d.PatchWidget(f.ctx, w.ID, fields(t, `{"query":{"metric":"points"}}`)); err == nil {
		t.Error("patching the measure alone was accepted")
	}
	if _, err := f.d.PatchWidget(f.ctx, w.ID, fields(t, `{"viz":"bar","query":{"metric":"points"}}`)); err != nil {
		t.Errorf("patching both: %v", err)
	}
	// The catalog tells the editor which chart type the metric needs.
	for _, m := range f.d.MetricCatalog().Metrics {
		if (m.Name == "points_and_hours") != (len(m.Vizzes) > 0) {
			t.Errorf("%s vizzes = %v", m.Name, m.Vizzes)
		}
	}
}
