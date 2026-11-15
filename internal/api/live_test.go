package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"jitterbug/internal/auth"
	"jitterbug/internal/live"
)

// listen opens the live connection as client c.
func listen(t *testing.T, c *client, header http.Header) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, res, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(c.url, "http")+"/api/live",
		&websocket.DialOptions{HTTPClient: c.h, HTTPHeader: header})
	if err == nil {
		t.Cleanup(func() { ws.CloseNow() })
	}
	return ws, res, err
}

// notes reads every note from ws into a channel. A read with a deadline
// would close the connection when it expires, so one reader runs for good.
func notes(ws *websocket.Conn) <-chan live.Event {
	ch := make(chan live.Event, 16)
	go func() {
		defer close(ch)
		for {
			var e live.Event
			if err := wsjson.Read(context.Background(), ws, &e); err != nil {
				return
			}
			ch <- e
		}
	}()
	return ch
}

// next waits up to wait for one note; ok is false when none came.
func next(t *testing.T, ch <-chan live.Event, wait time.Duration) (live.Event, bool) {
	t.Helper()
	select {
	case e, ok := <-ch:
		return e, ok
	case <-time.After(wait):
		return live.Event{}, false
	}
}

// put changes a setting, as tab.
func (c *client) putAs(tab, path, body string) int {
	c.t.Helper()
	req, _ := http.NewRequest("PUT", c.url+path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	if tab != "" {
		req.Header.Set(tabHeader, tab)
	}
	res, err := c.h.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	res.Body.Close()
	return res.StatusCode
}

// waitListening waits until the server has registered n tabs for user 1..2.
func waitListening(t *testing.T, s *Server, user int64, n int) {
	t.Helper()
	for i := 0; i < 200; i++ {
		if s.Live.Listeners(user) == n {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("user %d has %d tabs listening, want %d", user, s.Live.Listeners(user), n)
}

func TestLiveNotesGoToThatPersonsOtherTabs(t *testing.T) {
	srv, s := newServerWith(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	if code := bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil); code != 200 {
		t.Fatalf("bob login = %d", code)
	}

	aws, _, err := listen(t, alice, nil)
	if err != nil {
		t.Fatal(err)
	}
	bws, _, err := listen(t, bob, nil)
	if err != nil {
		t.Fatal(err)
	}
	waitListening(t, s, 1, 1)
	waitListening(t, s, 2, 1)
	an, bn := notes(aws), notes(bws)

	// Alice's change reaches Alice, named after the tab that made it.
	if code := alice.putAs("tab-1", "/api/settings/greeting", `"hi"`); code != 200 {
		t.Fatalf("put setting = %d", code)
	}
	e, ok := next(t, an, 2*time.Second)
	if !ok || e.Topic != "settings" || e.Tab != "tab-1" {
		t.Fatalf("alice got %+v, %v", e, ok)
	}
	// Bob hears nothing about Alice's data.
	if e, ok := next(t, bn, 200*time.Millisecond); ok {
		t.Fatalf("bob got alice's note %+v", e)
	}

	// Reading changes nothing, and a refused write announces nothing.
	alice.do("GET", "/api/bootstrap", nil, nil)
	alice.do("POST", "/api/tasks", m{}, nil) // invalid: no title
	if e, ok := next(t, an, 200*time.Millisecond); ok {
		t.Fatalf("note without a change: %+v", e)
	}

	// A tab name that is not plain letters and digits is dropped, not echoed.
	if code := alice.putAs(`"><script>`, "/api/settings/greeting", `"hey"`); code != 200 {
		t.Fatalf("odd tab put = %d", code)
	}
	if e, ok := next(t, an, 2*time.Second); !ok || e.Tab != "" {
		t.Fatalf("odd tab name: %+v, %v", e, ok)
	}
}

func TestLiveRefusesSignedOutAndOtherSites(t *testing.T) {
	srv, _ := newServerWith(t)
	alice := newClient(t, srv)
	if _, res, err := listen(t, alice, nil); err == nil || res == nil || res.StatusCode != 401 {
		t.Fatalf("signed out: err %v, res %v", err, res)
	}
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	h := http.Header{}
	h.Set("Origin", "https://evil.example")
	if _, res, err := listen(t, alice, h); err == nil || res == nil || res.StatusCode != 403 {
		t.Fatalf("other site: err %v, res %v", err, res)
	}
}

func TestLiveClosesAfterSignOut(t *testing.T) {
	old := livePing
	livePing = 50 * time.Millisecond
	defer func() { livePing = old }()
	srv, s := newServerWith(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	ws, _, err := listen(t, alice, nil)
	if err != nil {
		t.Fatal(err)
	}
	waitListening(t, s, 1, 1)
	alice.do("POST", "/api/auth/logout", nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _, err = ws.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Fatalf("after sign-out: %v", err)
	}
	waitListening(t, s, 1, 0)
}

func TestChangeTopic(t *testing.T) {
	cases := []struct {
		method, path string
		code         int
		want         string
	}{
		{"POST", "/api/tasks/5/move", 200, "tasks"},
		{"PATCH", "/api/sessions/3", 200, "sessions"},
		{"POST", "/api/sync", 200, "sync"},
		{"GET", "/api/tasks", 200, ""},
		{"POST", "/api/tasks", 400, ""},
		{"POST", "/api/capture", 200, ""},
		{"POST", "/api/sync/outgoing", 200, ""},
		{"POST", "/api/auth/password", 200, ""},
	}
	for _, c := range cases {
		r, _ := http.NewRequest(c.method, "http://x"+c.path, nil)
		if got := changeTopic(r, c.code); got != c.want {
			t.Errorf("%s %s %d = %q, want %q", c.method, c.path, c.code, got, c.want)
		}
	}
}

// newServerWith is newServer that also hands back the Server.
func newServerWith(t *testing.T) (*httptest.Server, *Server) {
	t.Helper()
	store, err := auth.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	s := New(store, nil, nil)
	srv := httptest.NewServer(s)
	t.Cleanup(srv.Close)
	return srv, s
}

// A phone sync that only fetches changed nothing: no tab reloads.
func TestLiveQuietForFetchOnlySync(t *testing.T) {
	srv, s := newServerWith(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	ws, _, err := listen(t, alice, nil)
	if err != nil {
		t.Fatal(err)
	}
	waitListening(t, s, 1, 1)
	ch := notes(ws)
	if code := alice.do("POST", "/api/sync", m{"device": "phone", "token": 0, "changes": []any{}}, nil); code != 200 {
		t.Fatalf("sync = %d", code)
	}
	if e, ok := next(t, ch, 300*time.Millisecond); ok {
		t.Fatalf("fetch-only sync sent %+v", e)
	}
}
