package api

import (
	"net/url"
	"testing"
)

// Change 001: a split across every energy type is the normal case, a 200.
// The response has no direction, and the old direction filter is gone.
func TestMetricsSplitByEveryTypeOverHTTP(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "long enough password"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	var res map[string]any
	if code := c.do("GET", "/api/metrics?metric=session_hours&group=day&range=30d&split=energy_type", nil, &res); code != 200 {
		t.Errorf("split by energy type = %d, want 200", code)
	}
	if _, ok := res["direction"]; ok {
		t.Errorf("response still has direction: %v", res)
	}
	var e struct{ Error, Detail string }
	q := url.Values{"metric": {"session_hours"}, "filters[direction]": {"restore"}}
	if code := c.do("GET", "/api/metrics?"+q.Encode(), nil, &e); code != 400 || e.Error != "invalid" {
		t.Errorf("direction filter = %d %+v, want a 400", code, e)
	}
	if code := c.do("GET", "/api/metrics?metric=balance", nil, nil); code != 400 {
		t.Errorf("unknown metric = %d, want 400", code)
	}
}

// The dashboard's date picker runs a saved widget over other dates.
func TestWidgetMetricOverDatesOverHTTP(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "long enough password"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	var w struct{ ID int64 }
	if code := c.do("POST", "/api/widgets", m{"dashboard_id": 1, "viz": "pie", "query": m{"metric": "session_hours", "group": "energy_type", "range": "today"}}, &w); code != 200 && code != 201 {
		t.Fatalf("create widget = %d", code)
	}
	var res struct{ From, To string }
	if code := c.do("GET", "/api/metrics?widget="+itoa(w.ID)+"&from=2026-03-01&to=2026-03-07", nil, &res); code != 200 {
		t.Fatalf("widget over dates = %d", code)
	}
	if res.From != "2026-03-01" || res.To != "2026-03-07" {
		t.Errorf("widget ran %s..%s, want the picked dates", res.From, res.To)
	}
	if code := c.do("GET", "/api/metrics?widget="+itoa(w.ID)+"&from=2026-03-07&to=2026-03-01", nil, nil); code != 400 {
		t.Errorf("dates backwards = %d, want 400", code)
	}
}
