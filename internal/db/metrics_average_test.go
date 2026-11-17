package db

import (
	"math"
	"testing"
)

// The server works out the average a chart draws as a dashed line: the
// mean of the per-key figures, empty days counting as zero.
func TestMetricAverage(t *testing.T) {
	f := newMetricFixture(t)
	near := func(what string, got *float64, want float64) {
		t.Helper()
		if got == nil || math.Abs(*got-want) > 1e-9 {
			t.Errorf("%s = %v, want %v", what, got, want)
		}
	}

	// 30 dense days: the sum of all session hours over 30, from SQL.
	var hours float64
	if err := f.d.QueryRow(`SELECT SUM(hours) FROM session WHERE deleted_at IS NULL AND logged_for BETWEEN '2026-10-01' AND '2026-10-30'`).Scan(&hours); err != nil {
		t.Fatal(err)
	}
	res := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d"})
	near("30-day average", res.Average, hours/30)

	// Split by energy type: the overall average adds the types up (every
	// type counts); each series has its own average over the same days.
	split := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d", Split: "energy_type"})
	near("split average", split.Average, hours/30)
	var sum float64
	for _, s := range split.Series {
		if s.Average == nil || math.Abs(*s.Average-s.Total/30) > 1e-9 {
			t.Errorf("series %s average = %v, want total %v / 30", s.Label, s.Average, s.Total)
		}
		sum += *s.Average
	}
	near("series averages added up", &sum, hours/30)

	// By week: the mean of the weekly totals.
	week := f.metric(t, MetricQuery{Metric: "session_hours", Group: "week", Range: "30d"})
	near("weekly average", week.Average, hours/float64(len(week.Points)))

	// A running total has no average, and nor does an empty range.
	if cum := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d", Cumulative: true}); cum.Average != nil {
		t.Errorf("cumulative average = %v, want none", *cum.Average)
	}
	if none := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", From: "2025-01-01", To: "2025-01-05"}); none.Average != nil {
		t.Errorf("empty average = %v, want none", *none.Average)
	}
}
