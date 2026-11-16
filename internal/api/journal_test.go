package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// The journal reads one person's sessions by date, or through a saved
// journal widget, with Markdown and totals made on the server; nobody can
// read another person's, and a widget that is not a journal is refused.
func TestJournal(t *testing.T) {
	srv, _ := newServerWith(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)

	code, body := alice.raw("POST", "/api/sessions", `{"kind":"event","label":"Reading","hours":0.75,"energy_type_id":1,"points":3,"logged_for":"2026-11-15","note":"two\nlines"}`)
	if code != 200 {
		t.Fatalf("log = %d %s", code, body)
	}
	type journal struct {
		From, To string
		More     bool
		Days     []struct {
			Day      string
			Hours    float64
			Points   float64
			Markdown string
		}
	}
	read := func(c *client, path string) (int, journal) {
		code, body := c.raw("GET", path, "")
		var j journal
		_ = json.Unmarshal([]byte(body), &j)
		return code, j
	}
	code, j := read(alice, "/api/journal?from=2026-11-15&to=2026-11-15")
	want := "## Sunday 15 November 2026 — 45m, 3 points\n- Reading — 45m  \n  two  \n  lines\n"
	if code != 200 || len(j.Days) != 1 || j.Days[0].Markdown != want || j.Days[0].Hours != 0.75 || j.Days[0].Points != 3 {
		t.Fatalf("journal = %d %+v", code, j)
	}
	if code, j := read(bob, "/api/journal?from=2026-11-15&to=2026-11-15"); code != 200 || len(j.Days) != 0 {
		t.Errorf("bob read alice's day: %d %+v", code, j)
	}
	if code, _ := read(newClient(t, srv), "/api/journal?from=2026-11-15&to=2026-11-15"); code != 401 {
		t.Errorf("signed out = %d, want 401", code)
	}
	for _, bad := range []string{"", "?from=2026-11-15", "?from=2026-11-16&to=2026-11-15", "?from=today&to=today", "?widget=x"} {
		if code, _ := read(alice, "/api/journal"+bad); code != 400 {
			t.Errorf("/api/journal%s = %d, want 400", bad, code)
		}
	}

	// A saved widget, over its own range or the dashboard's dates.
	code, body = alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"source":"journal","title":"What I did","query":{"range":"7d"}}`)
	var w struct {
		ID          int64
		Source, Viz string
	}
	if code != 200 || json.Unmarshal([]byte(body), &w) != nil || w.Source != "journal" || w.Viz != "journal" {
		t.Fatalf("saving a journal widget = %d %s", code, body)
	}
	if code, j := read(alice, "/api/journal?widget="+itoa(w.ID)+"&from=2026-11-14&to=2026-11-16"); code != 200 || len(j.Days) != 1 || j.From != "2026-11-14" {
		t.Errorf("widget over dates = %d %+v", code, j)
	}
	if code, j := read(alice, "/api/journal?widget="+itoa(w.ID)); code != 200 || j.To == "" {
		t.Errorf("widget over its own range = %d %+v", code, j)
	}
	if code, _ := read(bob, "/api/journal?widget="+itoa(w.ID)); code != 404 {
		t.Errorf("bob running alice's widget = %d, want 404", code)
	}
	for _, bad := range []string{`{"range":"all"}`, `{"metric":"points"}`, `{"range":"7d","view_id":1}`} {
		if code, body := alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"source":"journal","query":`+bad+`}`); code != 400 {
			t.Errorf("%s = %d %s", bad, code, body)
		}
	}
	// A journal is not a metric or app data, and a metric widget is not a journal.
	if code, _ := alice.raw("GET", "/api/metrics?widget="+itoa(w.ID), ""); code != 400 {
		t.Errorf("journal widget as a metric = %d", code)
	}
	code, body = alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"viz":"number","query":{"metric":"points","range":"7d"}}`)
	var metric struct{ ID int64 }
	if code != 200 || json.Unmarshal([]byte(body), &metric) != nil {
		t.Fatalf("metric widget = %d %s", code, body)
	}
	if code, body := alice.raw("GET", "/api/journal?widget="+itoa(metric.ID), ""); code != 400 || !strings.Contains(body, "journal") {
		t.Errorf("metric widget as a journal = %d %s", code, body)
	}
}
