package db

import (
	"fmt"
	"testing"
	"time"
)

// parseLocal reads "2006-01-02 15:04" as IST wall-clock time.
func parseLocal(s string) (time.Time, error) { return time.ParseInLocation("2006-01-02 15:04", s, ist) }

func TestTaskMetricsLocalDaysAndSQL(t *testing.T) {
	f := newMetricFixture(t)
	d := f.d
	move := func(taskID, status int64, ts string) {
		var from int64
		d.QueryRow(`SELECT status_id FROM task WHERE id = ?`, taskID).Scan(&from)
		if _, err := d.Exec(`INSERT INTO status_transition (task_id, from_status_id, to_status_id, reason, at) VALUES (?, ?, ?, 'user', ?)`,
			taskID, from, status, ts); err != nil {
			t.Fatal(err)
		}
		d.Exec(`UPDATE task SET status_id = ? WHERE id = ?`, status, taskID)
	}
	ts := func(local string) string { // "2026-10-29 00:30" IST -> stored UTC
		tm, err := parseLocal(local)
		if err != nil {
			t.Fatal(err)
		}
		return FormatTime(tm)
	}
	a := mustTask(t, d, f.main.ID, "late night close")
	b := mustTask(t, d, f.main.ID, "evening close")
	c := mustTask(t, d, f.home.ID, "still going")
	e := mustTask(t, d, f.home.ID, "backlog thing")
	d.Exec(`UPDATE status_transition SET at = ? WHERE task_id IN (?, ?, ?, ?)`, ts("2026-10-20 09:00"), a.ID, b.ID, c.ID, e.ID)
	move(a.ID, 3, ts("2026-10-27 10:00"))
	move(a.ID, 4, ts("2026-10-29 00:30")) // 2026-10-28 19:00 UTC, but the 29th in IST
	move(b.ID, 3, ts("2026-10-28 09:00"))
	move(b.ID, 4, ts("2026-10-28 23:30")) // the 28th in IST
	move(c.ID, 3, ts("2026-10-29 12:00"))
	move(e.ID, 1, ts("2026-10-21 12:00")) // Backlog: off the board

	res := f.metric(t, MetricQuery{Metric: "tasks_closed", Group: "day", Range: "7d"})
	got := pointMap(res)
	if got["2026-10-29"] != 1 || got["2026-10-28"] != 1 || res.Total != 2 {
		t.Errorf("closed by IST day = %v (total %v), want one on the 28th and one on the 29th", got, res.Total)
	}

	res = f.metric(t, MetricQuery{Metric: "tasks_open", Group: "status"})
	sameTotals(t, "open by status", pointMap(res), sqlTotals(t, d, `SELECT t.status_id, COUNT(*) FROM task t
		JOIN status s ON s.id = t.status_id JOIN status_category c ON c.id = s.category_id
		WHERE c.behaviour IN ('todo', 'in_progress') AND t.type = 'task' GROUP BY t.status_id`))

	// Stuck work: open tasks on the board, longest in status first.
	res = f.metric(t, MetricQuery{Metric: "time_in_status", Group: "task"})
	if len(res.Points) != 1 || res.Points[0].Label != "still going" || res.Points[0].Detail != "In progress" {
		t.Fatalf("stuck = %+v, want only the in-progress task", res.Points)
	}
	if h := res.Points[0].Value; h < 23.9 || h > 24.1 {
		t.Errorf("time in status = %v h, want 24 (noon to noon)", h)
	}

	// Cycle time by status inside the range, in local days: task a spent
	// 2026-10-27 10:00 .. 10-29 00:30 IST in progress = 38.5 h.
	res = f.metric(t, MetricQuery{Metric: "cycle_time", Group: "task", Split: "status", From: "2026-10-27", To: "2026-10-29", Filters: map[string][]string{"task_id": {fmt.Sprint(a.ID)}}})
	if got := pointMap(res)[fmt.Sprintf("%d3", a.ID)]; got < 38.49 || got > 38.51 {
		t.Errorf("cycle time in progress = %v, want 38.5", got)
	}
	// To do from 10-27 00:00 (range start, clipped) to 10:00 = 10 h.
	if got := pointMap(res)[fmt.Sprintf("%d2", a.ID)]; got < 9.99 || got > 10.01 {
		t.Errorf("cycle time to do (clipped) = %v, want 10", got)
	}
}

func TestStateDaysSpansAndCounts(t *testing.T) {
	f := newMetricFixture(t)
	d, ctx := f.d, f.ctx
	mk := func(js string) *State {
		s, err := d.CreateState(ctx, fields(t, js), "2026-10-30")
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	mk(`{"name":"flare-up","kind":"debuff","severity":4,"started_on":"2026-10-05","duration_days":21,"decay":"linear","cleared_on":"2026-10-26"}`)
	mk(`{"name":"new shoes","kind":"buff","severity":1,"started_on":"2026-10-28"}`)
	mk(`{"name":"long gone","kind":"debuff","started_on":"2026-09-01","cleared_on":"2026-09-10"}`)

	res := f.metric(t, MetricQuery{Metric: "state_days", Group: "day", Range: "30d"})
	if len(res.Spans) != 2 {
		t.Fatalf("spans = %+v, want 2", res.Spans)
	}
	flare := res.Spans[0]
	if flare.From != "2026-10-05" || flare.To != "2026-10-25" || !flare.Cleared {
		t.Errorf("3-week debuff span = %+v, want one span 10-05..10-25", flare)
	}
	if res.Total != 21+3 {
		t.Errorf("state-days = %v, want 24", res.Total)
	}
	res = f.metric(t, MetricQuery{Metric: "state_days", Group: "day", Range: "30d", Reduce: "nonzero", Filters: map[string][]string{"kind": {"debuff"}}})
	if res.Total != 21 {
		t.Errorf("days with a debuff = %v, want 21", res.Total)
	}
	res = f.metric(t, MetricQuery{Metric: "state_days", Group: "name", Range: "today"})
	if len(res.Points) != 1 || res.Points[0].Detail != "buff · day 3 · 1" {
		t.Errorf("in force today = %+v", res.Points)
	}
}

func TestPlanMetrics(t *testing.T) {
	f := newMetricFixture(t)
	d := f.d
	// Engineering hours in the fixture: 10-29 = 5.5, 10-30 = 6.5; Physical 1 each.
	d.Exec(`INSERT INTO day_plan (day, ceilings) VALUES ('2026-10-29', '{"1": 5, "2": 2, "4": 1}'), ('2026-10-30', '{"1": 8}')`)
	res := f.metric(t, MetricQuery{Metric: "days_over_plan", Group: "day", Range: "7d"})
	if len(res.Points) != 1 || res.Points[0].Key != "2026-10-29" || res.Points[0].Detail != "Engineering 5.5 of 5" {
		t.Errorf("days over plan = %+v", res.Points)
	}
	res = f.metric(t, MetricQuery{Metric: "ceiling_vs_actual", Group: "energy_type", Range: "7d"})
	got := pointMap(res)
	if fmt.Sprintf("%.4f", got["1"]) != fmt.Sprintf("%.4f", 12.0/13) || got["2"] != 0.5 || res.Direction != "spend" {
		t.Errorf("ceiling vs actual = %v, want Engineering 12/13, Physical 0.5 (Rest has no ceiling)", got)
	}
	if _, ok := got["4"]; ok {
		t.Error("a restore energy type was set against a ceiling")
	}

	// Drift: no low days yet (today has spend), and plans exist.
	res = f.metric(t, MetricQuery{Metric: "drift"})
	if res.Total != 0 || res.Meta["has_plans"] != true {
		t.Errorf("drift = %v %v", res.Total, res.Meta)
	}
}

func TestDriftCountsLowDaysAgainstPlannedBreak(t *testing.T) {
	d := openTest(t)
	a := mustArea(t, d, "Main job", "OM2")
	f := &metricFixture{d: d, ctx: t.Context(), main: a}
	res := f.metric(t, MetricQuery{Metric: "drift"})
	if res.Meta["has_plans"] != false {
		t.Errorf("drift without plans = %v", res.Meta)
	}
	d.CreateSession(f.ctx, fields(t, `{"energy_type_id":1,"hours":6,"logged_for":"2026-10-23"}`))
	d.CreateSession(f.ctx, fields(t, `{"energy_type_id":1,"hours":0.5,"logged_for":"2026-10-26"}`))
	d.Exec(`INSERT INTO day_plan (day, ceilings) VALUES ('2026-10-24', '{"1": 0}'), ('2026-10-25', '{"1": 0}'), ('2026-10-27', '{"1": 6}')`)
	res = f.metric(t, MetricQuery{Metric: "drift"})
	// 10-24 .. 10-30 are all under an hour: day 7, of a 2-day planned break.
	if res.Total != 7 || res.Meta["planned_break"] != 2 || res.Meta["run_start"] != "2026-10-24" {
		t.Errorf("drift = %v %v, want 7 days with a 2-day break", res.Total, res.Meta)
	}
}
