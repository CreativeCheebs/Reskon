package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
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

func TestSessionHoursAndPointsMatchSQL(t *testing.T) {
	f := newMetricFixture(t)
	res := f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d"})
	if res.Unit != "hours" {
		t.Errorf("unit = %s", res.Unit)
	}
	if len(res.Points) != 30 || res.From != "2026-10-01" || res.To != "2026-10-30" {
		t.Errorf("30d gave %d points %s..%s, want 30 dense days 2026-10-01..2026-10-30", len(res.Points), res.From, res.To)
	}
	sameTotals(t, "hours, every type", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for, SUM(hours) FROM session
		WHERE deleted_at IS NULL GROUP BY logged_for`))

	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Range: "7d", Filters: map[string][]string{"energy_type": {"Rest"}}})
	sameTotals(t, "Rest hours", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for, SUM(hours) FROM session
		WHERE energy_type_id = 4 AND logged_for >= '2026-10-24' GROUP BY logged_for`))

	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "day", Filters: map[string][]string{"area": {"personal"}}})
	sameTotals(t, "personal by name", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for, SUM(hours) FROM session
		WHERE area_id = ? GROUP BY logged_for`, f.home.ID))

	res = f.metric(t, MetricQuery{Metric: "points", Group: "day", Range: "30d"})
	sameTotals(t, "points", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for, SUM(points) FROM session GROUP BY logged_for`))
	want := sqlTotals(t, f.d, `SELECT 'all', SUM(points) FROM session`)["all"]
	if res.Total != want {
		t.Errorf("points total = %v, want %v", res.Total, want)
	}

	res = f.metric(t, MetricQuery{Metric: "points", Group: "area", Range: "all"})
	sameTotals(t, "points by area", pointMap(res), sqlTotals(t, f.d, `SELECT area_id, SUM(points) FROM session GROUP BY area_id`))
	if res.Points[0].Label != "Main job" {
		t.Errorf("area label = %q", res.Points[0].Label)
	}

	res = f.metric(t, MetricQuery{Metric: "points", Group: "energy_type", Range: "all"})
	sameTotals(t, "points by type", pointMap(res), sqlTotals(t, f.d, `SELECT energy_type_id, SUM(points) FROM session GROUP BY energy_type_id`))

	// By subtype, hours carry the rank weight (rank 1 = 1.0 here).
	res = f.metric(t, MetricQuery{Metric: "session_hours", Group: "subtype"})
	sameTotals(t, "hours by subtype", pointMap(res), sqlTotals(t, f.d, `SELECT ss.subtype_id, SUM(s.hours) FROM session s
		JOIN session_subtype ss ON ss.session_id = s.id GROUP BY ss.subtype_id`))

	res = f.metric(t, MetricQuery{Metric: "points", Group: "day", Range: "7d", Cumulative: true})
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
	res := f.metric(t, MetricQuery{Metric: "points", Group: "day", From: "2025-01-01", To: "2025-01-31"})
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
		res := f.metric(t, MetricQuery{Metric: "points", Group: "week", From: "2026-10-01", To: "2026-10-31"})
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

// Change 001: a split by energy type returns every type, the old restore
// types included, each with its own hours and points. There is no guard
// left to refuse it.
func TestSplitByEnergyTypeReturnsEveryType(t *testing.T) {
	f := newMetricFixture(t)
	for _, metric := range []string{"session_hours", "points"} {
		res := f.metric(t, MetricQuery{Metric: metric, Group: "day", Range: "30d", Split: "energy_type"})
		var names []string
		for _, s := range res.Series {
			names = append(names, s.Label)
		}
		if strings.Join(names, ",") != "Engineering,Physical,Admin,Rest" {
			t.Errorf("%s series = %v, want every logged type in position order", metric, names)
		}
		col := map[string]string{"session_hours": "hours", "points": "points"}[metric]
		sameTotals(t, metric+" by type", pointMap(res), sqlTotals(t, f.d, `SELECT logged_for || energy_type_id, SUM(`+col+`)
			FROM session WHERE logged_for >= '2026-10-01' GROUP BY 1`))
		// Each series carries its own total, for small multiples.
		own := map[string]float64{}
		for _, s := range res.Series {
			own[s.Key] = s.Total
		}
		sameTotals(t, metric+" series totals", own, sqlTotals(t, f.d, `SELECT energy_type_id, SUM(`+col+`)
			FROM session WHERE logged_for >= '2026-10-01' GROUP BY 1`))
	}
}

// No metric in the registry nets types: none subtracts one energy type
// from another or divides by one. Checked as a property: logging more
// hours of any type, on its own, never lowers any value of any metric,
// in any grouping or split. "Work minus rest" or "work / rest" would fall
// when rest is added. (Drift is a run of days under a threshold, not a
// value per type: more hours of a counted type end the run by design.)
func TestNoMetricNetsEnergyTypes(t *testing.T) {
	f := newMetricFixture(t)
	f.d.Exec(`INSERT INTO day_plan (day, ceilings) VALUES ('2026-10-29', '{"1": 5, "4": 8}'), ('2026-10-30', '{"1": 8, "2": 2, "4": 6}')`)
	var shapes []MetricQuery
	for name, m := range metricRegistry {
		if name == "drift" {
			continue
		}
		for _, g := range m.Groups {
			shapes = append(shapes, MetricQuery{Metric: name, Group: g, Range: "7d"})
			for _, sp := range m.Splits {
				if sp != g {
					shapes = append(shapes, MetricQuery{Metric: name, Group: g, Range: "7d", Split: sp})
				}
			}
		}
	}
	snapshot := func() map[string]map[string]float64 {
		out := map[string]map[string]float64{}
		for _, q := range shapes {
			out[fmt.Sprintf("%+v", q)] = pointMap(f.metric(t, q))
		}
		return out
	}
	for _, energy := range []int64{1, 2, 3, 4, 5} {
		before := snapshot()
		if _, err := f.d.CreateSession(f.ctx, fields(t, fmt.Sprintf(`{"energy_type_id":%d,"hours":3,"kind":"event","logged_for":"2026-10-30"}`, energy))); err != nil {
			t.Fatal(err)
		}
		after := snapshot()
		for q, vals := range before {
			for k, v := range vals {
				if after[q][k] < v-1e-9 {
					t.Errorf("adding energy type %d lowered %s[%s]: %v -> %v", energy, q, k, v, after[q][k])
				}
			}
		}
	}
}

func TestMetricCatalogListsGroupsAndFilters(t *testing.T) {
	d := openTest(t)
	cat := d.MetricCatalog()
	if len(cat.Metrics) == 0 || cat.Metrics[0].Name != "session_hours" {
		t.Fatalf("catalog starts with %v", cat.Metrics)
	}
	for _, m := range cat.Metrics {
		if len(m.Groups) == 0 || m.Unit == "" || m.Label == "" || m.run == nil {
			t.Errorf("%s is incomplete: %+v", m.Name, m)
		}
		// Every grouping the catalog offers must be accepted.
		for _, g := range m.Groups {
			q := MetricQuery{Metric: m.Name, Group: g}
			if _, err := CheckMetricQuery(&q); err != nil {
				t.Errorf("%s by %s: %v", m.Name, g, err)
			}
		}
	}
	for _, name := range []string{"balance", "net_energy", "productivity_rate"} {
		if _, ok := metricRegistry[name]; ok {
			t.Errorf("%s must never exist", name)
		}
	}
}
