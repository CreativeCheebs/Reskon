package db

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"
)

// Metric tests check arithmetic against hand-written SQL on a seeded
// fixture, as the spec asks.

var ist = time.FixedZone("IST", 5*3600+1800)

// metricNow is 2026-10-30 12:00 IST.
var metricNow = time.Date(2026, 10, 30, 12, 0, 0, 0, ist)

type metricFixture struct {
	d      *DB
	ctx    context.Context
	main   *Area
	home   *Area
	coding *Subtype
	gym    *Subtype
}

// newMetricFixture logs a spread of spend and restore sessions over
// 2026-10-20 .. 2026-10-30 in two areas, some with subtypes.
func newMetricFixture(t *testing.T) *metricFixture {
	t.Helper()
	d := openTest(t)
	ctx := context.Background()
	f := &metricFixture{d: d, ctx: ctx}
	f.main = mustArea(t, d, "Main job", "OM2")
	f.home = mustArea(t, d, "Personal", "PER")
	f.coding, _ = d.CreateSubtype(ctx, fields(t, `{"name":"coding","energy_type_id":1}`))
	f.gym, _ = d.CreateSubtype(ctx, fields(t, `{"name":"gym","energy_type_id":2}`))
	log := func(js string) {
		if _, err := d.CreateSession(ctx, fields(t, js)); err != nil {
			t.Fatalf("%s: %v", js, err)
		}
	}
	for i, day := range []string{"2026-10-20", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-29", "2026-10-30"} {
		log(fmt.Sprintf(`{"area_id":%d,"energy_type_id":1,"hours":%v,"difficulty":%d,"logged_for":%q,"subtypes":[%d]}`,
			f.main.ID, 1.5+float64(i), i%5+1, day, f.coding.ID))
		log(fmt.Sprintf(`{"area_id":%d,"energy_type_id":2,"hours":1,"logged_for":%q,"subtypes":[%d]}`, f.home.ID, day, f.gym.ID))
		log(fmt.Sprintf(`{"area_id":%d,"energy_type_id":4,"hours":7.5,"kind":"event","logged_for":%q}`, f.home.ID, day))
	}
	log(fmt.Sprintf(`{"area_id":%d,"energy_type_id":3,"hours":0.5,"logged_for":"2026-10-30"}`, f.home.ID))
	return f
}

func (f *metricFixture) metric(t *testing.T, q MetricQuery) *MetricResult {
	t.Helper()
	res, err := f.d.Metric(f.ctx, q, metricNow)
	if err != nil {
		t.Fatalf("%+v: %v", q, err)
	}
	return res
}

// sqlTotals runs a hand-written "key, value" query.
func sqlTotals(t *testing.T, d *DB, query string, args ...any) map[string]float64 {
	t.Helper()
	out := map[string]float64{}
	err := scanInto(context.Background(), d, query, func(r *sql.Rows) error {
		var k string
		var v float64
		err := r.Scan(&k, &v)
		out[k] = v
		return err
	}, args...)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func pointMap(res *MetricResult) map[string]float64 {
	out := map[string]float64{}
	for _, p := range res.Points {
		out[p.Key+p.Split] += p.Value
	}
	return out
}

func sameTotals(t *testing.T, what string, got, want map[string]float64) {
	t.Helper()
	for k, w := range want {
		if g := got[k]; fmt.Sprintf("%.6f", g) != fmt.Sprintf("%.6f", w) {
			t.Errorf("%s[%s] = %v, want %v", what, k, g, w)
		}
	}
	for k, g := range got {
		if _, ok := want[k]; !ok && g != 0 {
			t.Errorf("%s[%s] = %v, want nothing", what, k, g)
		}
	}
}

func TestSessionHoursAndWorkPointsMatchSQL(t *testing.T) {
	f := newMetricFixture(t)
	res := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d", Filters: map[string][]string{"direction": {"spend"}}})
	if res.Direction != "spend" || res.Unit != "hours" {
		t.Errorf("direction/unit = %s/%s", res.Direction, res.Unit)
	}
	if len(res.Points) != 30 || res.From != "2026-10-01" || res.To != "2026-10-30" {
		t.Errorf("30d gave %d points %s..%s, want 30 dense days 2026-10-01..2026-10-30", len(res.Points), res.From, res.To)
	}
	sameTotals(t, "spend hours", pointMap(res), sqlTotals(t, f.d, `SELECT s.logged_for, SUM(s.hours) FROM session s
		JOIN energy_type e ON e.id = s.energy_type_id WHERE e.direction = 'spend' AND s.deleted_at IS NULL GROUP BY s.logged_for`))

	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "7d", Filters: map[string][]string{"direction": {"restore"}}})
	sameTotals(t, "restore hours", pointMap(res), sqlTotals(t, f.d, `SELECT s.logged_for, SUM(s.hours) FROM session s
		JOIN energy_type e ON e.id = s.energy_type_id WHERE e.direction = 'restore' AND s.logged_for >= '2026-10-24' GROUP BY s.logged_for`))

	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Filters: map[string][]string{"area": {"personal"}, "direction": {"spend"}}})
	sameTotals(t, "personal spend by name", pointMap(res), sqlTotals(t, f.d, `SELECT s.logged_for, SUM(s.hours) FROM session s
		JOIN energy_type e ON e.id = s.energy_type_id WHERE e.direction = 'spend' AND s.area_id = ? GROUP BY s.logged_for`, f.home.ID))

	res = f.metric(t, MetricQuery{Metric: "work_points", Group: "day", Range: "30d"})
	sameTotals(t, "points", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for, SUM(points) FROM session
		WHERE points IS NOT NULL GROUP BY logged_for`))
	want := sqlTotals(t, f.d, `SELECT 'all', SUM(points) FROM session`)["all"]
	if res.Total != want || res.Direction != "spend" {
		t.Errorf("points total = %v (%s), want %v (spend)", res.Total, res.Direction, want)
	}

	res = f.metric(t, MetricQuery{Metric: "work_points", Group: "area", Range: "all"})
	sameTotals(t, "points by area", pointMap(res), sqlTotals(t, f.d, `SELECT area_id, SUM(points) FROM session
		WHERE points IS NOT NULL GROUP BY area_id`))
	if res.Points[0].Label != "Main job" {
		t.Errorf("area label = %q", res.Points[0].Label)
	}

	// By subtype, hours carry the rank weight (rank 1 = 1.0 here).
	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "subtype", Filters: map[string][]string{"direction": {"spend"}}})
	sameTotals(t, "hours by subtype", pointMap(res), sqlTotals(t, f.d, `SELECT ss.subtype_id, SUM(s.hours) FROM session s
		JOIN session_subtype ss ON ss.session_id = s.id GROUP BY ss.subtype_id`))

	res = f.metric(t, MetricQuery{Metric: "work_points", Group: "day", Range: "7d", Cumulative: true})
	if last := res.Points[len(res.Points)-1].Value; last != sqlTotals(t, f.d, `SELECT 'x', SUM(points) FROM session WHERE logged_for >= '2026-10-24'`)["x"] {
		t.Errorf("cumulative ends at %v", last)
	}
	for i := 1; i < len(res.Points); i++ {
		if res.Points[i].Value < res.Points[i-1].Value {
			t.Errorf("cumulative fell at %s", res.Points[i].Key)
		}
	}

	res = f.metric(t, MetricQuery{Metric: "session_count", Group: "day", Split: "kind", Range: "7d"})
	sameTotals(t, "count by kind", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for || kind, COUNT(*) FROM session
		WHERE logged_for >= '2026-10-24' GROUP BY logged_for, kind`))
}

func TestMetricEmptyRangeIsEmptyList(t *testing.T) {
	f := newMetricFixture(t)
	res := f.metric(t, MetricQuery{Metric: "work_points", Group: "day", From: "2025-01-01", To: "2025-01-31"})
	if res.Points == nil || len(res.Points) != 0 || res.Total != 0 {
		t.Errorf("empty range = %+v, want [] and total 0", res.Points)
	}
}

func TestWeekGroupingFollowsWeekStart(t *testing.T) {
	f := newMetricFixture(t)
	// 2026-10-20 is a Tuesday. For every start day, each week key must be
	// that weekday, and the totals must match SQL bucketing by the same rule.
	for ws := 1; ws <= 7; ws++ {
		f.d.PutSetting(f.ctx, "week_start", []byte(fmt.Sprint(ws)))
		res := f.metric(t, MetricQuery{Metric: "work_points", Group: "week", From: "2026-10-01", To: "2026-10-31"})
		for _, p := range res.Points {
			wd := int(parseDay(p.Key).Weekday())
			if wd == 0 {
				wd = 7
			}
			if wd != ws {
				t.Errorf("week_start %d: key %s is ISO weekday %d", ws, p.Key, wd)
			}
		}
		// SQLite: %w is 0 = Sunday. Days back to the week start = (iso - ws + 7) % 7.
		want := sqlTotals(t, f.d, `SELECT date(logged_for, '-' || (((CAST(strftime('%w', logged_for) AS INTEGER) + 6) % 7 + 1 - ? + 7) % 7) || ' days'),
			SUM(points) FROM session WHERE points IS NOT NULL GROUP BY 1`, ws)
		sameTotals(t, fmt.Sprintf("week_start %d", ws), pointMap(res), want)
	}
}

// The direction guard rejects every query that would mix spend and
// restore, and allows each direction on its own.
func TestDirectionGuard(t *testing.T) {
	f := newMetricFixture(t)
	gym := fmt.Sprint(f.gym.ID)
	mixed := []MetricQuery{
		{Metric: "session_hours"},
		{Metric: "session_hours", Split: "energy_type"},
		{Metric: "session_hours", Group: "energy_type"},
		{Metric: "session_hours", Filters: map[string][]string{"area": {"Personal"}}},
		{Metric: "session_hours", Filters: map[string][]string{"direction": {"spend", "restore"}}},
		{Metric: "session_hours", Filters: map[string][]string{"energy_type": {"Engineering", "Rest"}}},
		{Metric: "session_hours", Filters: map[string][]string{"energy_type": {"2", "5"}}, Split: "energy_type"},
		{Metric: "session_hours", Filters: map[string][]string{"kind": {"event"}}},
		{Metric: "session_hours", Filters: map[string][]string{"task_id": {"1"}}},
	}
	for _, q := range mixed {
		_, err := f.d.Metric(f.ctx, q, metricNow)
		if _, ok := err.(*InvalidError); !ok {
			t.Errorf("%+v: err = %v, want a 400", q, err)
		}
	}
	allowed := []MetricQuery{
		{Metric: "session_hours", Filters: map[string][]string{"direction": {"restore"}}, Split: "energy_type"},
		{Metric: "session_hours", Filters: map[string][]string{"energy_type": {"Engineering", "Admin"}}, Split: "energy_type"},
		{Metric: "session_hours", Filters: map[string][]string{"subtype": {gym}}},
		{Metric: "session_hours", Filters: map[string][]string{"subtype": {gym}, "energy_type": {"Rest"}}}, // matches nothing
		{Metric: "work_points", Split: "energy_type"}, // spend only by definition
	}
	for _, q := range allowed {
		if _, err := f.d.Metric(f.ctx, q, metricNow); err != nil {
			t.Errorf("%+v: %v", q, err)
		}
	}
}
