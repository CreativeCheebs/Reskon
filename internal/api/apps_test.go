package api

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"jitterbug/internal/apps/appstest"
)

// raw sends a JSON request and returns the status and the reply as text.
func (c *client) raw(method, path, body string) (int, string) {
	c.t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req, _ := http.NewRequest(method, c.url+path, r)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.h.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func TestConnectedApps(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	srv, s := newServerWith(t)
	s.AppsEnabled = true
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)

	// Preview shows what the app offers and how it signs in, and saves nothing.
	code, body := alice.raw("POST", "/api/apps/preview", `{"address":"`+f.URL+`"}`)
	if code != 200 || !strings.Contains(body, `"kind":"password"`) || !strings.Contains(body, "Today's habits") {
		t.Fatalf("preview = %d %s", code, body)
	}
	if code, body = alice.raw("GET", "/api/apps", ""); body != "[]\n" {
		t.Fatalf("preview saved something: %s", body)
	}
	if code, body = alice.raw("POST", "/api/apps/preview", `{"address":"http://127.0.0.1:1"}`); code != 502 {
		t.Errorf("unreachable preview = %d %s", code, body)
	}

	// A wrong password is said plainly; the app's own reply is not passed on.
	code, body = alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"nope"}`)
	if code != 400 || !strings.Contains(body, "wrong") || strings.Contains(body, "secret") {
		t.Fatalf("wrong password = %d %s", code, body)
	}
	code, body = alice.raw("POST", "/api/apps", `{"address":"`+f.URL+`","username":"aakash","password":"habits-123"}`)
	if code != 200 || !strings.Contains(body, `"signed_in":true`) {
		t.Fatalf("connect = %d %s", code, body)
	}
	// The token never reaches the browser.
	for _, path := range []string{"/api/apps", "/api/bootstrap"} {
		if _, body := alice.raw("GET", path, ""); strings.Contains(body, f.Token) {
			t.Errorf("%s shows the app's token", path)
		}
	}

	// Each person has their own apps.
	if _, body := bob.raw("GET", "/api/apps", ""); body != "[]\n" {
		t.Errorf("bob sees alice's apps: %s", body)
	}
	if code, _ := bob.raw("DELETE", "/api/apps/1", ""); code != 404 {
		t.Errorf("bob removing alice's app = %d", code)
	}

	if code, body = alice.raw("POST", "/api/apps/1/check", ""); code != 200 || !strings.Contains(body, `"status":"ok"`) {
		t.Errorf("check = %d %s", code, body)
	}
	f.Password, f.Token = "changed", "tok-new"
	if code, body = alice.raw("POST", "/api/apps/1/sign-in", `{"username":"aakash","password":"changed"}`); code != 200 || strings.Contains(body, "tok-new") {
		t.Errorf("sign in again = %d %s", code, body)
	}
	if code, _ = alice.raw("DELETE", "/api/apps/1", ""); code != 200 {
		t.Errorf("remove = %d", code)
	}
	if _, body = alice.raw("GET", "/api/apps", ""); body != "[]\n" {
		t.Errorf("after remove: %s", body)
	}

	// The phone's built-in server has no connected apps.
	s.AppsEnabled = false
	if code, _ = alice.raw("GET", "/api/apps", ""); code != 404 {
		t.Errorf("apps off = %d", code)
	}
	// Signed out: refused like every other API call.
	if code, _ = newClient(t, srv).raw("GET", "/api/apps", ""); code != 401 {
		t.Errorf("signed out = %d", code)
	}
}
