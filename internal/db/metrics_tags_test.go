package db

import (
	"context"
	"fmt"
	"math"
	"testing"
)

// The tag filter on session metrics means the same as on the sessions list: the task's tags or the
// session's own, and 0 for none. The phone draws its day totals from the metric, so the two must agree.
func TestSessionMetricsFilterByTagLikeTheSessionsList(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	task, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"backend job","area_id":%d,"tags":["backend"]}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	log := func(js string) {
		t.Helper()
		if _, err := d.CreateSession(ctx, fields(t, js)); err != nil {
			t.Fatalf("%s: %v", js, err)
		}
	}
	log(fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-10-28"}`, task.ID))               // the task's tag
	log(`{"hours":2,"energy_type_id":1,"logged_for":"2026-10-28","kind":"event","tags":["ui"]}`)                     // its own tag
	log(`{"hours":4,"energy_type_id":2,"logged_for":"2026-10-29","kind":"event"}`)                                   // no tags
	log(fmt.Sprintf(`{"task_id":%d,"hours":8,"energy_type_id":1,"logged_for":"2026-10-29","tags":["ui"]}`, task.ID)) // both
	backID, uiID := tagID(t, d, "backend"), tagID(t, d, "ui")

	for _, tags := range [][]int64{{backID}, {uiID}, {0}, {0, uiID}, {backID, uiID}} {
		list, err := d.ListSessions(ctx, SessionQuery{From: "2026-10-20", To: "2026-10-30", Tags: tags})
		if err != nil {
			t.Fatal(err)
		}
		var want float64
		for _, s := range list {
			want += s.Hours
		}
		var vals []string
		for _, id := range tags {
			vals = append(vals, fmt.Sprint(id))
		}
		for _, metric := range []string{"session_hours", "points"} {
			res, err := d.Metric(ctx, MetricQuery{Metric: metric, Group: "day", Range: "30d", Filters: map[string][]string{"tag": vals}}, metricNow)
			if err != nil {
				t.Fatalf("%s tags %v: %v", metric, tags, err)
			}
			if metric == "session_hours" && math.Abs(res.Total-want) > 1e-9 {
				t.Errorf("tags %v: metric says %v hours, the sessions list adds up to %v", tags, res.Total, want)
			}
		}
	}

	// With other filters, and a deleted session is not counted: still the same as the list.
	extra, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":16,"energy_type_id":1,"logged_for":"2026-10-29"}`, task.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteSession(ctx, extra.ID); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"task", "event"} {
		list, err := d.ListSessions(ctx, SessionQuery{From: "2026-10-20", To: "2026-10-30", Tags: []int64{backID, uiID}, Kind: kind})
		if err != nil {
			t.Fatal(err)
		}
		var want float64
		for _, s := range list {
			want += s.Hours
		}
		res, err := d.Metric(ctx, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d", Filters: map[string][]string{"tag": {fmt.Sprint(backID), fmt.Sprint(uiID)}, "kind": {kind}}}, metricNow)
		if err != nil {
			t.Fatal(err)
		}
		if math.Abs(res.Total-want) > 1e-9 {
			t.Errorf("tag + kind %s: metric says %v hours, the sessions list adds up to %v", kind, res.Total, want)
		}
	}

	// A bad value is refused, not ignored.
	if _, err := d.Metric(ctx, MetricQuery{Metric: "session_hours", Group: "day", Range: "30d", Filters: map[string][]string{"tag": {"backend"}}}, metricNow); err == nil {
		t.Error("a tag filter that is not an id should be refused")
	}
}
