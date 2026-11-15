package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"jitterbug/internal/apps/appstest"
)

// An app data widget is saved only for a connected app's data widget, with
// a chart type that suits its shape; it is drawn from the app, or from the
// kept copy when the app is down, and sends no live note when fetched.
func TestAppDataWidgets(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	srv, s := newServerWith(t)
	s.AppsEnabled = true
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)

	widget := func(c *client, viz, q string) (int, string) {
		return c.raw("POST", "/api/widgets", `{"dashboard_id":1,"source":"app_data","viz":"`+viz+`","query":`+q+`,"w":4,"h":4}`)
	}
	if code, body := widget(alice, "checklist", `{"app":"habits","widget":"today_list"}`); code != 400 || !strings.Contains(body, "Settings › Apps") {
		t.Fatalf("before connecting = %d %s", code, body)
	}
	if code, body := alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`); code != 200 {
		t.Fatalf("connect = %d %s", code, body)
	}
	for _, c := range []struct{ viz, q string }{
		{"bar", `{"app":"habits","widget":"today_list"}`},                    // a checklist is drawn as a checklist
		{"checklist", `{"app":"habits","widget":"last_days"}`},               // a series is not
		{"page", `{"app":"habits","widget":"today_list"}`},                   // not a chart type for data
		{"pie", `{"app":"habits","widget":"last_days"}`},                     // not for app data
		{"checklist", `{"app":"habits","widget":"today"}`},                   // a page, not data
		{"checklist", `{"app":"habits","widget":"nope"}`},                    // not offered
		{"checklist", `{"app":"habits","widget":"today_list","range":"7d"}`}, // no range on this feed
		{"bar", `{"app":"habits","widget":"last_days","group":"month"}`},     // not one of its groups
		{"bar", `{"app":"habits","widget":"last_days","range":"all"}`},       // "all" means nothing to an app
		{"bar", `{"app":"habits","widget":"last_days","metric":"points"}`},
	} {
		if code, body := widget(alice, c.viz, c.q); code != 400 {
			t.Errorf("%s %s = %d %s", c.viz, c.q, code, body)
		}
	}
	// Metrics never draw as a checklist.
	if code, _ := alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"viz":"checklist","query":{"metric":"points"}}`); code != 400 {
		t.Error("a metric was saved as a checklist")
	}

	var list, series struct {
		ID  int64  `json:"id"`
		Viz string `json:"viz"`
	}
	code, body := widget(alice, "checklist", `{"app":"habits","widget":"today_list"}`)
	if code != 200 || json.Unmarshal([]byte(body), &list) != nil {
		t.Fatalf("save checklist = %d %s", code, body)
	}
	code, body = widget(alice, "bar", `{"app":"habits","widget":"last_days","range":"7d","group":"day"}`)
	if code != 200 || json.Unmarshal([]byte(body), &series) != nil {
		t.Fatalf("save series = %d %s", code, body)
	}
	// A patch of the chart type alone is checked against the saved query.
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(series.ID), `{"viz":"table"}`); code != 400 {
		t.Errorf("series as a table = %d %s", code, body)
	}
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(series.ID), `{"viz":"line"}`); code != 200 {
		t.Errorf("series as a line = %d %s", code, body)
	}
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(series.ID), `{"query":{"app":"habits","widget":"today_list"}}`); code != 400 {
		t.Errorf("patched to a checklist while drawn as a line = %d %s", code, body)
	}

	// Drawing: no live note, and never the token.
	ws, _, err := listen(t, alice, nil)
	if err != nil {
		t.Fatal(err)
	}
	waitListening(t, s, 1, 1)
	ch := notes(ws)
	f.Tick("walk", true)
	code, body = alice.raw("GET", "/api/apps/data?widget="+itoa64(list.ID), "")
	var res struct {
		Shape  string `json:"shape"`
		Total  float64
		Points []struct {
			Key   string
			Value float64
		}
		FetchedAt   string `json:"fetched_at"`
		Stale       bool   `json:"stale"`
		StaleReason string `json:"stale_reason"`
	}
	if code != 200 || json.Unmarshal([]byte(body), &res) != nil || res.Shape != "checklist" || res.Total != 1 || len(res.Points) != 3 || res.Stale || res.FetchedAt == "" || strings.Contains(body, f.Token) {
		t.Fatalf("checklist = %d %s", code, body)
	}
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(series.ID)+"&from=2026-11-01&to=2026-11-07", ""); code != 200 || !strings.Contains(body, `"from":"2026-11-01"`) {
		t.Errorf("series with the dashboard's dates = %d %s", code, body)
	}
	if code, body := alice.raw("GET", "/api/apps/data/preview?app=habits&widget=last_days&range=30d&group=week&viz=cumulative", ""); code != 200 || !strings.Contains(body, `"cumulative":true`) {
		t.Errorf("preview = %d %s", code, body)
	}
	if code, _ := alice.raw("GET", "/api/apps/data/preview?app=habits&widget=last_days&viz=checklist", ""); code != 400 {
		t.Errorf("preview with a chart type that does not suit = %d", code)
	}
	if e, ok := next(t, ch, 300*time.Millisecond); ok {
		t.Errorf("fetching sent %+v", e)
	}

	// The app's feeds are off: the copy, marked stale, with when and why.
	f.SetFeedsOff(true)
	f.Tick("read", true)
	code, body = alice.raw("GET", "/api/apps/data?widget="+itoa64(list.ID), "")
	if code != 200 || json.Unmarshal([]byte(body), &res) != nil || !res.Stale || res.Total != 1 || !strings.Contains(res.StaleReason, "503") || strings.Contains(body, "secret") {
		t.Errorf("stale = %d %s", code, body)
	}
	// Nothing kept for a range never asked: a 502, in Reskon's words.
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(series.ID)+"&from=2025-01-01&to=2025-01-02", ""); code != 502 || strings.Contains(body, "secret") {
		t.Errorf("no copy = %d %s", code, body)
	}
	f.SetFeedsOff(false)
	// The app takes the token no more, nothing kept: a 400, never a 401.
	f.SetToken("tok-new")
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(series.ID)+"&from=2025-02-01&to=2025-02-02", ""); code != 400 || !strings.Contains(body, "sign in to Habits again") {
		t.Errorf("withdrawn token = %d %s", code, body)
	}
	f.SetToken("tok-123")

	// Another site's page cannot make Reskon ask the app (a link or an image
	// pointing here); Reskon's own page and a typed address can.
	for site, want := range map[string]int{"cross-site": 403, "same-site": 403, "same-origin": 200, "none": 200} {
		req, _ := http.NewRequest("GET", alice.url+"/api/apps/data?widget="+itoa64(list.ID), nil)
		req.Header.Set("Sec-Fetch-Site", site)
		res, err := alice.h.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("Sec-Fetch-Site %s = %d, want %d", site, res.StatusCode, want)
		}
	}
	// Dates are capped at 400 days.
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(series.ID)+"&from=2024-01-01&to=2026-01-01", ""); code != 400 || !strings.Contains(body, "400 days") {
		t.Errorf("two years = %d %s", code, body)
	}
	// The app changed the data's shape: the saved chart type no longer suits
	// it, so the widget asks to be edited (a 400, never a 401).
	f.SetWidgetShape("last_days", "table")
	alice.raw("POST", "/api/apps/1/check", "")
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(series.ID), ""); code != 400 || !strings.Contains(body, "edit this widget") {
		t.Errorf("changed shape = %d %s", code, body)
	}
	f.SetWidgetShape("last_days", "series")
	alice.raw("POST", "/api/apps/1/check", "")

	// Bob cannot draw Alice's widget, nor her app's data.
	if code, _ := bob.raw("GET", "/api/apps/data?widget="+itoa64(list.ID), ""); code != 404 {
		t.Errorf("bob = %d", code)
	}
	if code, _ := bob.raw("GET", "/api/apps/data/preview?app=habits&widget=today_list&viz=checklist", ""); code != 400 {
		t.Errorf("bob's preview = %d", code)
	}
	// A metric widget is not app data, and an app data widget is not a metric.
	_, body = alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"viz":"number","query":{"metric":"points","range":"today"}}`)
	var metric struct{ ID int64 }
	_ = json.Unmarshal([]byte(body), &metric)
	if code, _ := alice.raw("GET", "/api/apps/data?widget="+itoa64(metric.ID), ""); code != 400 {
		t.Errorf("metric widget as app data = %d", code)
	}
	if code, _ := alice.raw("GET", "/api/metrics?widget="+itoa64(list.ID), ""); code != 400 {
		t.Errorf("app data widget as a metric = %d", code)
	}
	// Removed app: a clear 404; the widget can still be moved.
	if code, _ := alice.raw("DELETE", "/api/apps/1", ""); code != 200 {
		t.Fatal("remove failed")
	}
	if code, body := alice.raw("GET", "/api/apps/data?widget="+itoa64(list.ID), ""); code != 404 || !strings.Contains(body, "not connected") {
		t.Errorf("after remove = %d %s", code, body)
	}
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(list.ID), `{"x":2}`); code != 200 {
		t.Errorf("move without the app = %d %s", code, body)
	}
	// The phone's built-in server has no apps.
	s.AppsEnabled = false
	if code, _ := alice.raw("GET", "/api/apps/data?widget="+itoa64(list.ID), ""); code != 404 {
		t.Errorf("draw with apps off = %d", code)
	}
}
