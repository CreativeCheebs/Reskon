package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"

	"jitterbug/internal/auth"
)

// client is one browser: its own cookie jar against the test server.
type client struct {
	t   *testing.T
	url string
	h   *http.Client
}

func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	store, err := auth.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	srv := httptest.NewServer(New(store, nil, nil))
	t.Cleanup(srv.Close)
	return srv
}

func newClient(t *testing.T, srv *httptest.Server) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, url: srv.URL, h: &http.Client{Jar: jar}}
}

// do sends a JSON request and decodes the reply into out (if non-nil).
func (c *client) do(method, path string, body any, out any) int {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.url+path, r)
	res, err := c.h.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		json.NewDecoder(res.Body).Decode(out)
	}
	return res.StatusCode
}

type m = map[string]any

func TestSignInFlowAndDataIsolation(t *testing.T) {
	srv := newServer(t)
	admin := newClient(t, srv)

	// Before setup: status says so, data endpoints refuse.
	var st struct {
		SetupNeeded bool       `json:"setup_needed"`
		User        *auth.User `json:"user"`
	}
	admin.do("GET", "/api/auth/status", nil, &st)
	if !st.SetupNeeded || st.User != nil {
		t.Fatalf("fresh server status = %+v", st)
	}
	if code := admin.do("GET", "/api/bootstrap", nil, nil); code != 401 {
		t.Errorf("bootstrap signed out = %d, want 401", code)
	}

	// Setup creates the admin and signs in.
	if code := admin.do("POST", "/api/auth/setup", m{"username": "Alice", "password": "short"}, nil); code != 400 {
		t.Errorf("short password = %d, want 400", code)
	}
	if code := admin.do("POST", "/api/auth/setup", m{"username": "Alice", "password": "correct horse"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	admin.do("GET", "/api/auth/status", nil, &st)
	if st.SetupNeeded || st.User == nil || st.User.Username != "alice" || !st.User.IsAdmin {
		t.Fatalf("after setup status = %+v", st)
	}
	// Setup cannot run twice (no takeover of a running server).
	stranger := newClient(t, srv)
	if code := stranger.do("POST", "/api/auth/setup", m{"username": "mallory", "password": "password123"}, nil); code != 409 {
		t.Errorf("second setup = %d, want 409", code)
	}

	// Admin adds bob. Bob cannot manage users.
	if code := admin.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil); code != 200 {
		t.Fatalf("create bob = %d", code)
	}
	bob := newClient(t, srv)
	if code := bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "wrong password"}, nil); code != 401 {
		t.Errorf("bad password = %d, want 401", code)
	}
	if code := bob.do("POST", "/api/auth/login", m{"username": "BOB", "password": "bobs password"}, nil); code != 200 {
		t.Fatalf("bob login = %d", code)
	}
	if code := bob.do("GET", "/api/users", nil, nil); code != 403 {
		t.Errorf("bob listing users = %d, want 403", code)
	}

	// Each user has their own data: same area prefix, own numbering, and
	// neither sees the other's tasks.
	for _, c := range []*client{admin, bob} {
		var area struct{ ID int64 }
		c.do("POST", "/api/areas", m{"name": "Personal", "key_prefix": "PER"}, &area)
		c.do("POST", "/api/tasks", m{"title": "task", "area_id": area.ID}, nil)
	}
	var aliceTasks, bobTasks []struct{ Key, Title string }
	admin.do("POST", "/api/tasks", m{"title": "alice only", "area_id": 1}, nil)
	admin.do("GET", "/api/tasks", nil, &aliceTasks)
	bob.do("GET", "/api/tasks", nil, &bobTasks)
	if len(aliceTasks) != 2 || len(bobTasks) != 1 {
		t.Fatalf("alice has %d tasks, bob has %d; want 2 and 1", len(aliceTasks), len(bobTasks))
	}
	if bobTasks[0].Key != "PER-1" {
		t.Errorf("bob's first key = %s, want PER-1 (own numbering)", bobTasks[0].Key)
	}
	for _, tk := range bobTasks {
		if tk.Title == "alice only" {
			t.Error("bob can see alice's task")
		}
	}

	// Disabling bob signs him out at once.
	var users []auth.User
	admin.do("GET", "/api/users", nil, &users)
	var bobID int64
	for _, u := range users {
		if u.Username == "bob" {
			bobID = u.ID
		}
	}
	admin.do("PATCH", "/api/users/"+itoa(bobID), m{"disabled": true}, nil)
	if code := bob.do("GET", "/api/tasks", nil, nil); code != 401 {
		t.Errorf("disabled bob = %d, want 401", code)
	}
	// The last admin cannot remove themself.
	if code := admin.do("PATCH", "/api/users/"+itoa(st.User.ID), m{"is_admin": false}, nil); code != 409 {
		t.Errorf("demoting last admin = %d, want 409", code)
	}

	// Logout ends the session.
	admin.do("POST", "/api/auth/logout", nil, nil)
	if code := admin.do("GET", "/api/bootstrap", nil, nil); code != 401 {
		t.Errorf("after logout = %d, want 401", code)
	}
}

func TestPasswordChangeSignsOutOtherSessions(t *testing.T) {
	srv := newServer(t)
	laptop := newClient(t, srv)
	laptop.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	phone := newClient(t, srv)
	phone.do("POST", "/api/auth/login", m{"username": "alice", "password": "first password"}, nil)

	if code := laptop.do("POST", "/api/auth/password", m{"current": "nope nope", "new": "second password"}, nil); code != 400 {
		t.Errorf("wrong current password = %d, want 400", code)
	}
	if code := laptop.do("POST", "/api/auth/password", m{"current": "first password", "new": "second password"}, nil); code != 200 {
		t.Fatalf("change = %d", code)
	}
	if code := laptop.do("GET", "/api/bootstrap", nil, nil); code != 200 {
		t.Errorf("own session dropped: %d", code)
	}
	if code := phone.do("GET", "/api/bootstrap", nil, nil); code != 401 {
		t.Errorf("other session kept: %d", code)
	}
}

func TestCrossOriginWritesRefused(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	req, _ := http.NewRequest("POST", srv.URL+"/api/areas", bytes.NewReader([]byte(`{"name":"x","key_prefix":"X"}`)))
	req.Header.Set("Origin", "https://evil.example")
	res, err := c.h.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Errorf("cross-origin POST = %d, want 403", res.StatusCode)
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }
