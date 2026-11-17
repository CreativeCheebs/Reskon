package db

import (
	"strings"
	"testing"
)

// A chart widget may save its own from and to dates instead of a named
// range; the metrics code answers over exactly those dates.
func TestWidgetCustomPeriod(t *testing.T) {
	f := newMetricFixture(t)
	w, err := f.d.CreateWidget(f.ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"session_hours","group":"day","from":"2026-10-20","to":"2026-10-23"}}`))
	if err != nil {
		t.Fatal(err)
	}
	q, err := f.d.WidgetQuery(f.ctx, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	res, err := f.d.Metric(f.ctx, q, metricNow)
	if err != nil {
		t.Fatal(err)
	}
	if res.From != "2026-10-20" || res.To != "2026-10-23" || len(res.Points) != 4 {
		t.Errorf("custom period gave %s..%s with %d points, want 2026-10-20..2026-10-23 with 4", res.From, res.To, len(res.Points))
	}

	// Half a period, or dates the wrong way round, are refused when saved.
	for _, bad := range []string{
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"points","from":"2026-10-20"}}`,
		`{"dashboard_id":1,"viz":"bar","query":{"metric":"points","from":"2026-10-23","to":"2026-10-20"}}`,
	} {
		if _, err := f.d.CreateWidget(f.ctx, fields(t, bad)); err == nil || !strings.Contains(err.Error(), "from and to") {
			t.Errorf("%s: err = %v", bad, err)
		}
	}
}
