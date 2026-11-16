package db

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// "yesterday" is the day before the person's own today. The edges that go
// wrong are the hours when their date and UTC's differ, month and year ends,
// and a leap day.
func TestYesterdayRangeDates(t *testing.T) {
	cases := []struct {
		today, want string
	}{
		{"2026-11-16", "2026-11-15"},
		{"2026-12-01", "2026-11-30"},
		{"2026-01-01", "2025-12-31"},
		{"2028-03-01", "2028-02-29"}, // a leap year
		{"2026-03-01", "2026-02-28"},
	}
	for _, c := range cases {
		from, to, err := (*DB)(nil).resolveRange(context.Background(), &MetricQuery{Range: "yesterday"}, c.today)
		if err != nil || from != c.want || to != c.want {
			t.Errorf("yesterday of %s = %s..%s (%v), want %s", c.today, from, to, err, c.want)
		}
		// The app feed's range gives the same two dates.
		if from, to, err := ResolveAppRange("yesterday", c.today); err != nil || from != c.want || to != c.want {
			t.Errorf("app range yesterday of %s = %s..%s (%v), want %s", c.today, from, to, err, c.want)
		}
	}
	if !contains(metricRanges, "yesterday") || !contains(AppDataRanges, "yesterday") {
		t.Error("yesterday is not offered in both range lists")
	}
	if !contains((&DB{}).MetricCatalog().Ranges, "yesterday") {
		t.Error("the catalog does not list yesterday")
	}
}

// Sessions on three days; the metric for "yesterday" counts only the day
// before the person's today, whichever zone "now" is in.
func TestYesterdayRangeAroundMidnightAndTimeZones(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	area := mustArea(t, d, "Work", "WRK")
	for day, hours := range map[string]float64{"2026-11-14": 1, "2026-11-15": 2, "2026-11-16": 4} {
		if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"area_id":%d,"energy_type_id":1,"hours":%v,"logged_for":%q}`, area.ID, hours, day))); err != nil {
			t.Fatal(err)
		}
	}
	kolkata, _ := time.LoadLocation("Asia/Kolkata")
	losAngeles, _ := time.LoadLocation("America/Los_Angeles")
	cases := []struct {
		name     string
		now      time.Time
		day      string
		hours    float64
		todayUTC string
	}{
		// 00:30 in Kolkata on the 16th is still the 15th in UTC: yesterday is the 15th, not the 14th.
		{"just after local midnight, UTC still the day before", time.Date(2026, 11, 16, 0, 30, 0, 0, kolkata), "2026-11-15", 2, "2026-11-15"},
		// 23:30 in Los Angeles on the 15th is already the 16th in UTC: yesterday is the 14th, not the 15th.
		{"just before local midnight, UTC already the next day", time.Date(2026, 11, 15, 23, 30, 0, 0, losAngeles), "2026-11-14", 1, "2026-11-16"},
		{"midday", time.Date(2026, 11, 16, 12, 0, 0, 0, time.UTC), "2026-11-15", 2, "2026-11-16"},
		// One second after local midnight turns the day over.
		{"one second past midnight", time.Date(2026, 11, 16, 0, 0, 1, 0, time.UTC), "2026-11-15", 2, "2026-11-16"},
		{"one second before midnight", time.Date(2026, 11, 15, 23, 59, 59, 0, time.UTC), "2026-11-14", 1, "2026-11-15"},
	}
	for _, c := range cases {
		if got := c.now.UTC().Format(dateFmt); got != c.todayUTC {
			t.Fatalf("%s: the case is wrong, UTC date is %s", c.name, got)
		}
		res, err := d.Metric(ctx, MetricQuery{Metric: "session_hours", Group: "day", Range: "yesterday"}, c.now)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if res.From != c.day || res.To != c.day || res.Total != c.hours {
			t.Errorf("%s: yesterday = %s..%s with %v hours, want %s with %v", c.name, res.From, res.To, res.Total, c.day, c.hours)
		}
	}
	// "today" in the same zone still means today, so the two never overlap.
	res, err := d.Metric(ctx, MetricQuery{Metric: "session_hours", Group: "day", Range: "today"}, time.Date(2026, 11, 16, 0, 30, 0, 0, kolkata))
	if err != nil || res.From != "2026-11-16" || res.Total != 4 {
		t.Errorf("today = %+v %v", res, err)
	}
}

// An empty yesterday is "no data", not an error.
func TestYesterdayRangeEmptyDay(t *testing.T) {
	d := openTest(t)
	res, err := d.Metric(context.Background(), MetricQuery{Metric: "points", Group: "day", Range: "yesterday"}, time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC))
	if err != nil || res.Total != 0 || res.From != "2026-11-15" {
		t.Errorf("empty yesterday = %+v %v", res, err)
	}
}

// A result says whether its range counted, so a widget only claims to show
// dates when they did.
func TestMetricResultSaysWhetherItIsRanged(t *testing.T) {
	d := openTest(t)
	now := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	for metric, want := range map[string]bool{"points": true, "time_in_status": false} {
		res, err := d.Metric(context.Background(), MetricQuery{Metric: metric, Range: "7d"}, now)
		if err != nil || res.Ranged != want {
			t.Errorf("%s: ranged = %v (%v), want %v", metric, res.Ranged, err, want)
		}
	}
}

// A widget can be saved with the new range, and a made-up one is refused.
func TestYesterdayWidgetSaves(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, _ := d.ListDashboards(ctx)
	dash := itoa(all[0].ID)
	if _, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":`+dash+`,"viz":"number","query":{"metric":"points","range":"yesterday"}}`)); err != nil {
		t.Errorf("yesterday refused: %v", err)
	}
	if _, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":`+dash+`,"viz":"number","query":{"metric":"points","range":"tomorrow"}}`)); err == nil {
		t.Error("tomorrow accepted")
	}
}
