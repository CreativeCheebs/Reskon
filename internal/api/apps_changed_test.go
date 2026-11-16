package api

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"jitterbug/internal/apps/appstest"
	"jitterbug/internal/live"
)

// hookCall is an app's server calling POST /api/apps/changed with an
// Authorization header (none when auth is "").
func hookCall(t *testing.T, base, auth string, header http.Header) int {
	t.Helper()
	req, _ := http.NewRequest("POST", base+HookPath, strings.NewReader(`{"anything":"ignored"}`))
	for k, v := range header {
		req.Header[k] = v
	}
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return res.StatusCode
}

// none checks no note arrives within wait.
func none(t *testing.T, ch <-chan live.Event, wait time.Duration, why string) {
	t.Helper()
	if e, ok := next(t, ch, wait); ok {
		t.Errorf("%s: unexpected note %+v", why, e)
	}
}

// appNote waits for an app_data note about habits, skipping other notes
// (connecting or checking an app sends the general "apps" one).
func appNote(t *testing.T, ch <-chan live.Event, why string) live.Event {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case e := <-ch:
			if e.Topic == live.TopicAppData {
				if e.App != "habits" {
					t.Fatalf("%s: note for %q", why, e.App)
				}
				return e
			}
		case <-deadline:
			t.Fatalf("%s: no app note", why)
		}
	}
}

// drain throws away notes already sent (the "apps" notes of checks).
func drain(ch <-chan live.Event) {
	for {
		select {
		case <-ch:
		case <-time.After(150 * time.Millisecond):
			return
		}
	}
}

func TestAppSaysChanged(t *testing.T) {
	old := noteEvery
	noteEvery = 300 * time.Millisecond
	defer func() { noteEvery = old }()
	wait := func() { time.Sleep(noteEvery + 50*time.Millisecond) }

	f := appstest.New()
	defer f.Close()
	srv, s := newServerWith(t)
	s.AppsEnabled = true
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)
	a, stopA, _ := s.Live.Subscribe(1)
	defer stopA()
	b, stopB, _ := s.Live.Subscribe(2)
	defer stopB()
	bearer := func(k string) string { return "Bearer " + k }

	// Only POST is public at the hook's address: any other method there is
	// an ordinary signed-in call, refused signed out (never a crash).
	anon := newClient(t, srv)
	for _, method := range []string{"DELETE", "GET", "PATCH"} {
		if code, _ := anon.raw(method, HookPath, ""); code != 401 {
			t.Errorf("%s %s signed out = %d", method, HookPath, code)
		}
	}

	// Connecting hands the app Reskon's address, as this request reached it,
	// and a key. The key never comes back to the browser.
	code, body := alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`)
	if code != 200 || !strings.Contains(body, `"changes":"ok"`) || !strings.Contains(body, `"changes_detail":""`) {
		t.Fatalf("connect = %d %s", code, body)
	}
	h := f.Hook()
	if h.ChangedURL != srv.URL+HookPath || len(h.Key) != 43 {
		t.Fatalf("hook handed = %+v", h)
	}
	for _, path := range []string{"/api/apps", "/api/bootstrap"} {
		if _, body := alice.raw("GET", path, ""); strings.Contains(body, h.Key) {
			t.Errorf("%s shows the key", path)
		}
	}
	drain(a)

	// The app's server says its data changed: alice's tabs hear, bob's don't.
	if c := hookCall(t, srv.URL, bearer(h.Key), nil); c != 204 {
		t.Fatalf("hook = %d", c)
	}
	if e := appNote(t, a, "hook"); e.Tab != "" {
		t.Errorf("hook note names a tab: %+v", e)
	}
	none(t, b, 200*time.Millisecond, "bob")

	// A burst gives one more note, at the end of the wait, not one per call.
	for i := 0; i < 5; i++ {
		if c := hookCall(t, srv.URL, bearer(h.Key), nil); c != 204 {
			t.Fatalf("burst call = %d", c)
		}
	}
	appNote(t, a, "end of burst")
	none(t, a, 500*time.Millisecond, "after the burst")

	// "bearer" in any case works. An unknown or malformed key gets the same
	// answer and does nothing; no key, or a browser on another site, is refused.
	if c := hookCall(t, srv.URL, "bearer "+h.Key, nil); c != 204 {
		t.Errorf("lower-case bearer = %d", c)
	}
	appNote(t, a, "lower-case bearer")
	wait()
	for _, k := range []string{"not-a-key", strings.Repeat("A", 43), h.Key + "x", strings.Repeat("x", 5000)} {
		if c := hookCall(t, srv.URL, bearer(k), nil); c != 204 {
			t.Errorf("bad key %.10q = %d", k, c)
		}
	}
	if c := hookCall(t, srv.URL, "", nil); c != 401 {
		t.Errorf("no key = %d", c)
	}
	if c := hookCall(t, srv.URL, "Basic "+h.Key, nil); c != 401 {
		t.Errorf("not bearer = %d", c)
	}
	if c := hookCall(t, srv.URL, bearer(h.Key), http.Header{"Origin": {"http://evil.example"}}); c != 403 {
		t.Errorf("cross-site = %d", c)
	}
	none(t, a, 400*time.Millisecond, "unknown, malformed, missing or cross-site key")

	// From Reskon's own page (the app's page in a frame posted "changed"):
	// the app's note naming the tab, never a general "apps" reload; and the
	// same 2-second limit per app, a second call folded into a later note.
	page := func(c *client, app, tab string) int {
		req, _ := http.NewRequest("POST", srv.URL+"/api/apps/"+app+"/changed", nil)
		if tab != "" {
			req.Header.Set(tabHeader, tab)
		}
		res, err := c.h.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	if c := page(alice, "habits", "tab-1"); c != 204 {
		t.Fatalf("page changed = %d", c)
	}
	if e := appNote(t, a, "page"); e.Tab != "tab-1" {
		t.Errorf("page note = %+v", e)
	}
	page(alice, "habits", "tab-1")
	hookCall(t, srv.URL, bearer(h.Key), nil) // same app, same limit
	if e := appNote(t, a, "folded page call"); e.Tab != "" {
		t.Errorf("a folded note must reach every tab: %+v", e)
	}
	none(t, a, 400*time.Millisecond, "after the page notes")
	if c := page(alice, "food", ""); c != 404 {
		t.Errorf("unknown app = %d", c)
	}
	if c := page(bob, "habits", ""); c != 404 {
		t.Errorf("bob naming alice's app = %d", c)
	}
	if c := page(anon, "habits", ""); c != 401 {
		t.Errorf("signed out = %d", c)
	}
	none(t, a, 200*time.Millisecond, "refused page calls")

	// Check again hands a fresh key every time; the old one stops working.
	if code, body = alice.raw("POST", "/api/apps/1/check", ""); code != 200 || !strings.Contains(body, `"changes":"ok"`) {
		t.Fatalf("check = %d %s", code, body)
	}
	h2 := f.Hook()
	if h2.Key == h.Key {
		t.Fatal("check kept the old key")
	}
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h.Key), nil)
	none(t, a, 400*time.Millisecond, "old key after check")
	hookCall(t, srv.URL, bearer(h2.Key), nil)
	appNote(t, a, "new key after check")

	// So does Sign in again.
	if code, body = alice.raw("POST", "/api/apps/1/sign-in", `{"username":"aakash","password":"habits-123"}`); code != 200 || !strings.Contains(body, `"changes":"ok"`) {
		t.Fatalf("sign in again = %d %s", code, body)
	}
	h3 := f.Hook()
	if h3.Key == h2.Key {
		t.Fatal("sign in again kept the old key")
	}
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h3.Key), nil)
	appNote(t, a, "key from sign in again")

	// A hand-over that fails leaves the old key working; Settings says why,
	// in Reskon's words.
	f.SetConnectFails(true)
	code, body = alice.raw("POST", "/api/apps/1/check", "")
	if code != 200 || !strings.Contains(body, `"changes":"failed"`) || !strings.Contains(body, "HTTP 500") || strings.Contains(body, "secret") {
		t.Fatalf("failed hand-over = %d %s", code, body)
	}
	f.SetConnectFails(false)
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h3.Key), nil)
	appNote(t, a, "old key after a failed hand-over")

	// Many checks at once: Reskon keeps the very key the app kept.
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			alice.raw("POST", "/api/apps/1/check", "")
		}()
	}
	wg.Wait()
	h4 := f.Hook()
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h4.Key), nil)
	appNote(t, a, "key after concurrent checks")

	// Removing the app drops its key.
	alice.raw("DELETE", "/api/apps/1", "")
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h4.Key), nil)
	none(t, a, 400*time.Millisecond, "removed app's key")

	// Connected again, then the app stops offering connect_url: its key goes.
	code, body = alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`)
	if code != 200 || !strings.Contains(body, `"changes":"ok"`) {
		t.Fatalf("reconnect = %d %s", code, body)
	}
	var list []struct {
		ID int64 `json:"id"`
	}
	alice.do("GET", "/api/apps", nil, &list)
	id := strconv.FormatInt(list[0].ID, 10)
	h5 := f.Hook()
	f.Set("connect_url", "")
	if code, body = alice.raw("POST", "/api/apps/"+id+"/check", ""); code != 200 || !strings.Contains(body, `"changes":""`) {
		t.Fatalf("check without connect_url = %d %s", code, body)
	}
	f.Set("connect_url", appstest.ConnectPath)
	drain(a)
	wait()
	hookCall(t, srv.URL, bearer(h5.Key), nil)
	none(t, a, 400*time.Millisecond, "key of an app without connect_url")

	// A disabled account's key does nothing.
	if code, body = bob.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`); code != 200 || !strings.Contains(body, `"changes":"ok"`) {
		t.Fatalf("bob connect = %d %s", code, body)
	}
	hb := f.Hook()
	drain(b)
	if err := s.Auth.SetDisabled(t.Context(), 2, true); err != nil {
		t.Fatal(err)
	}
	hookCall(t, srv.URL, bearer(hb.Key), nil)
	none(t, b, 400*time.Millisecond, "disabled account's key")
	_ = s.Auth.SetDisabled(t.Context(), 2, false)
	hookCall(t, srv.URL, bearer(hb.Key), nil)
	appNote(t, b, "enabled again")

	// The phone's built-in server has no hook.
	s.AppsEnabled = false
	if c := hookCall(t, srv.URL, bearer(hb.Key), nil); c != 404 {
		t.Errorf("apps off = %d", c)
	}
}

func TestChangedURL(t *testing.T) {
	s := &Server{}
	req := func(h map[string]string) *http.Request {
		r, _ := http.NewRequest("POST", "http://reskon.home:8080/api/apps", nil)
		for k, v := range h {
			r.Header.Set(k, v)
		}
		return r
	}
	if u, w := s.changedURL(req(nil)); u != "http://reskon.home:8080"+HookPath || w != "" {
		t.Errorf("plain = %q %q", u, w)
	}
	// Proxied, no proxy declared: the browser's address, with a warning;
	// the forwarded headers are not believed.
	u, w := s.changedURL(req(map[string]string{"X-Forwarded-Proto": "https", "X-Forwarded-Host": "evil.example"}))
	if u != "http://reskon.home:8080"+HookPath || !strings.Contains(w, "JITTERBUG_BEHIND_PROXY") {
		t.Errorf("undeclared proxy = %q %q", u, w)
	}
	// The browser was on HTTPS, the address is plain HTTP: a warning.
	if _, w := s.changedURL(req(map[string]string{"Origin": "https://reskon.home"})); !strings.Contains(w, "HTTPS") {
		t.Errorf("https origin warning = %q", w)
	}
	// Behind a declared proxy, its headers decide.
	s.TrustProxy = true
	if u, w := s.changedURL(req(map[string]string{"X-Forwarded-Proto": "https", "X-Forwarded-Host": "reskon.example, inner", "Origin": "https://reskon.example"})); u != "https://reskon.example"+HookPath || w != "" {
		t.Errorf("declared proxy = %q %q", u, w)
	}
	if u, _ := s.changedURL(req(map[string]string{"X-Forwarded-Host": "a/b@c"})); u != "" {
		t.Errorf("odd host = %q", u)
	}
}

func TestHookMissLimit(t *testing.T) {
	l := (&Server{}).notes()
	for i := 0; i < maxMisses; i++ {
		if l.tooManyMisses("10.0.0.9") {
			t.Fatalf("limited after %d misses", i)
		}
		l.miss("10.0.0.9")
	}
	if !l.tooManyMisses("10.0.0.9") {
		t.Error("not limited after the maximum")
	}
	if l.tooManyMisses("10.0.0.10") {
		t.Error("another address is limited too")
	}
}
