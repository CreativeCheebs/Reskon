package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"jitterbug/internal/apps/appstest"
)

// The pretend plugin's page, signed in with a ticket from a launch, as the
// browser would: swap the ticket, then tick a habit.
func pageSignIn(t *testing.T, f *appstest.Fake, link string) string {
	t.Helper()
	_, frag, _ := strings.Cut(link, "#")
	v, _ := url.ParseQuery(frag)
	b, _ := json.Marshal(map[string]string{"ticket": v.Get("ticket")})
	res, err := http.Post(f.URL+"/api/page/session", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out struct{ Session string }
	if res.StatusCode != 200 || json.NewDecoder(res.Body).Decode(&out) != nil {
		t.Fatalf("page sign-in = %d", res.StatusCode)
	}
	return out.Session
}

func TestAppPageWidgets(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	f.ReskonOrigin = "http://reskon.example:8097"
	srv, s := newServerWith(t)
	s.AppsEnabled = true
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)

	widget := func(c *client, q string) (int, string) {
		return c.raw("POST", "/api/widgets", `{"dashboard_id":1,"source":"app_page","title":"Today's habits","query":`+q+`,"w":4,"h":4}`)
	}
	// Not connected yet: refused when saving, with what to do.
	if code, body := widget(alice, `{"app":"habits","widget":"today"}`); code != 400 || !strings.Contains(body, "Settings › Apps") {
		t.Fatalf("before connecting = %d %s", code, body)
	}
	if code, body := alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`); code != 200 {
		t.Fatalf("connect = %d %s", code, body)
	}
	for _, q := range []string{`{"app":"habits","widget":"last_days"}`, `{"app":"habits","widget":"nope"}`, `{"app":"food","widget":"today"}`} {
		if code, body := widget(alice, q); code != 400 {
			t.Errorf("%s = %d %s", q, code, body)
		}
	}
	code, body := widget(alice, `{"app":"habits","widget":"today"}`)
	var saved struct {
		ID  int64  `json:"id"`
		Viz string `json:"viz"`
	}
	if code != 200 || json.Unmarshal([]byte(body), &saved) != nil || saved.Viz != "page" {
		t.Fatalf("save = %d %s", code, body)
	}
	// A patch's new page is checked too; a new title alone needs no app.
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(saved.ID), `{"query":{"app":"habits","widget":"last_days"}}`); code != 400 {
		t.Errorf("patch to a data widget = %d %s", code, body)
	}
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(saved.ID), `{"title":"Habits today"}`); code != 200 {
		t.Errorf("rename = %d %s", code, body)
	}

	// Showing it: a launch sends no live note (each would reload every
	// other tab, which would launch again).
	ws, _, err := listen(t, alice, nil)
	if err != nil {
		t.Fatal(err)
	}
	waitListening(t, s, 1, 1)
	ch := notes(ws)
	launch := `{"widget":` + itoa64(saved.ID) + `}`
	code, body = alice.raw("POST", "/api/apps/launch", launch)
	var link struct{ URL, Origin, Style string }
	if code != 200 || json.Unmarshal([]byte(body), &link) != nil {
		t.Fatalf("launch = %d %s", code, body)
	}
	if !strings.HasPrefix(link.URL, f.URL+"/widgets/today#ticket=") || link.Origin != f.URL || link.Style != "reskon" || strings.Contains(body, f.Token) {
		t.Fatalf("launch = %s", body)
	}
	if e, ok := next(t, ch, 300*time.Millisecond); ok {
		t.Errorf("a launch sent %+v", e)
	}

	// The page signs in with the ticket and can tick a habit.
	session := pageSignIn(t, f, link.URL)
	req, _ := http.NewRequest("POST", f.URL+"/api/page/today/walk", strings.NewReader(`{"done":true}`))
	req.Header.Set("Authorization", "Bearer "+session)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 || !f.Done("walk") {
		t.Fatalf("tick = %v %v", res, err)
	}
	res.Body.Close()
	// The page may be framed by that Reskon only.
	res, err = http.Get(f.URL + "/widgets/today")
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if got := res.Header.Get("Content-Security-Policy"); got != "frame-ancestors http://reskon.example:8097" || res.Header.Get("X-Frame-Options") != "" {
		t.Errorf("page framing headers: %q", got)
	}
	if !strings.Contains(string(page), `"http://reskon.example:8097"`) {
		t.Error("the page does not know Reskon's address")
	}

	// Bob cannot launch Alice's widget: it is not in his database.
	if code, _ := bob.raw("POST", "/api/apps/launch", launch); code != 404 {
		t.Errorf("bob = %d", code)
	}
	// A metric widget has no page.
	_, body = alice.raw("POST", "/api/widgets", `{"dashboard_id":1,"viz":"number","query":{"metric":"points","range":"today"}}`)
	var metric struct{ ID int64 }
	_ = json.Unmarshal([]byte(body), &metric)
	if code, body := alice.raw("POST", "/api/apps/launch", `{"widget":`+itoa64(metric.ID)+`}`); code != 400 {
		t.Errorf("metric widget launch = %d %s", code, body)
	}
	// The app withdrew Reskon's token: never a 401 (that means Reskon signed you out).
	f.Token = "tok-new"
	if code, body := alice.raw("POST", "/api/apps/launch", launch); code != 400 || !strings.Contains(body, "sign in to Habits again") || strings.Contains(body, "secret") {
		t.Errorf("withdrawn token = %d %s", code, body)
	}
	f.Token = "tok-123"
	// Removed app: a clear 404.
	if code, _ := alice.raw("DELETE", "/api/apps/1", ""); code != 200 {
		t.Fatal("remove failed")
	}
	if code, body := alice.raw("POST", "/api/apps/launch", launch); code != 404 || !strings.Contains(body, "not connected") {
		t.Errorf("after remove = %d %s", code, body)
	}
	// The widget can still be moved or removed without the app.
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(saved.ID), `{"x":2}`); code != 200 {
		t.Errorf("move without the app = %d %s", code, body)
	}
	// The phone's built-in server has no apps: no app pages saved or shown there.
	s.AppsEnabled = false
	if code, _ := alice.raw("POST", "/api/apps/launch", launch); code != 404 {
		t.Errorf("launch with apps off = %d", code)
	}
	if code, body := widget(alice, `{"app":"habits","widget":"today"}`); code != 400 {
		t.Errorf("save with apps off = %d %s", code, body)
	}
}

// Reskon's own pages may not be framed, but nothing limits which other
// addresses its pages frame (no frame-src or default-src), and a tab opened
// from an app's page gets no handle on Reskon's tab.
func TestReskonFramesOthersButIsNotFramed(t *testing.T) {
	srv, _ := newServerWith(t)
	res, err := http.Get(srv.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	csp := res.Header.Get("Content-Security-Policy")
	if !strings.Contains(csp, "frame-ancestors 'none'") || strings.Contains(csp, "frame-src") || strings.Contains(csp, "default-src") || strings.Contains(csp, "child-src") {
		t.Errorf("CSP = %q", csp)
	}
	if res.Header.Get("Cross-Origin-Opener-Policy") != "same-origin" {
		t.Errorf("Cross-Origin-Opener-Policy = %q", res.Header.Get("Cross-Origin-Opener-Policy"))
	}
	if res.Header.Get("X-Frame-Options") != "DENY" {
		t.Errorf("X-Frame-Options = %q", res.Header.Get("X-Frame-Options"))
	}
}

func itoa64(n int64) string { b, _ := json.Marshal(n); return string(b) }

// An app that cannot be reached, a replaced app, and a deleted dashboard.
func TestAppPageWidgetsWhenThingsGoWrong(t *testing.T) {
	f := appstest.New()
	srv, s := newServerWith(t)
	s.AppsEnabled = true
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	if code, body := alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`); code != 200 {
		t.Fatalf("connect = %d %s", code, body)
	}
	_, body := alice.raw("POST", "/api/dashboards", `{"name":"Mine"}`)
	var dash struct{ ID int64 }
	_ = json.Unmarshal([]byte(body), &dash)
	save := `{"dashboard_id":` + itoa64(dash.ID) + `,"source":"app_page","query":{"app":"habits","widget":"today"}}`
	code, body := alice.raw("POST", "/api/widgets", save)
	var saved struct{ ID int64 }
	if code != 200 || json.Unmarshal([]byte(body), &saved) != nil {
		t.Fatalf("save = %d %s", code, body)
	}
	launch := `{"widget":` + itoa64(saved.ID) + `}`

	// Another app answers at the address: no new widgets for it, no launches.
	f.Set("id", "food")
	alice.raw("POST", "/api/apps/1/check", "")
	if code, body := alice.raw("POST", "/api/widgets", save); code != 400 || !strings.Contains(body, "check Habits again") {
		t.Errorf("save for a replaced app = %d %s", code, body)
	}
	if code, _ := alice.raw("POST", "/api/apps/launch", launch); code != 400 {
		t.Errorf("launch for a replaced app = %d", code)
	}
	f.Set("id", "habits")
	alice.raw("POST", "/api/apps/1/check", "")

	// Down: a 502 with a safe reason.
	f.Close()
	if code, body := alice.raw("POST", "/api/apps/launch", launch); code != 502 || strings.Contains(body, "secret") {
		t.Errorf("launch while down = %d %s", code, body)
	}

	// A widget whose dashboard was deleted is not shown anywhere.
	if code, _ := alice.raw("DELETE", "/api/dashboards/"+itoa64(dash.ID), ""); code != 200 {
		t.Fatal("delete dashboard failed")
	}
	if code, _ := alice.raw("POST", "/api/apps/launch", launch); code != 404 {
		t.Errorf("launch on a deleted dashboard = %d", code)
	}
}

func TestSameHostPort(t *testing.T) {
	for _, c := range []struct {
		page, host string
		same       bool
	}{
		{"http://192.168.0.8:8097/w", "192.168.0.8:8097", true},
		{"http://reskon.home/w", "reskon.home:80", true},
		{"https://reskon.home/w", "reskon.home", true},
		{"http://192.168.0.8:8098/w", "192.168.0.8:8097", false},
		{"http://other.home:8097/w", "reskon.home:8097", false},
	} {
		if got := sameHostPort(c.page, c.host); got != c.same {
			t.Errorf("%s on %s = %v", c.page, c.host, got)
		}
	}
}
