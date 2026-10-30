package api

import (
	"net/url"
	"testing"
)

// The HTTP side of the direction guard: a split spanning spend and
// restore is a 400; one direction is a 200 with that direction.
func TestMetricsDirectionGuardOverHTTP(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "long enough password"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	var e struct{ Error, Detail string }
	if code := c.do("GET", "/api/metrics?metric=session_hours&group=day&range=30d&split=energy_type", nil, &e); code != 400 {
		t.Errorf("mixed split = %d, want 400", code)
	}
	if e.Error != "invalid" || e.Detail == "" {
		t.Errorf("error body = %+v", e)
	}
	var res struct {
		Direction string `json:"direction"`
		Points    []any  `json:"points"`
	}
	q := url.Values{"metric": {"session_hours"}, "split": {"energy_type"}, "filters[direction]": {"restore"}}
	if code := c.do("GET", "/api/metrics?"+q.Encode(), nil, &res); code != 200 || res.Direction != "restore" || res.Points == nil {
		t.Errorf("restore only = %d %+v", code, res)
	}
	if code := c.do("GET", "/api/metrics?metric=balance", nil, nil); code != 400 {
		t.Errorf("unknown metric = %d, want 400", code)
	}
}
