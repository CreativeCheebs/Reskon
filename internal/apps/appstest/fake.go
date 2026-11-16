// Package appstest is a pretend plugin: a small habit tracker that serves a
// description file, a login, tickets, a web page widget ("Today's
// habits", fake_page.go) and data widgets (fake_data.go), as
// docs/plugins.md describes. Tests use it, and
// cmd/example-plugin runs it on the test server.
package appstest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"
)

// Fake is a running pretend plugin.
type Fake struct {
	*httptest.Server
	mu sync.Mutex
	// Manifest is served at /.well-known/reskon-app.json; change it to test
	// other descriptions.
	Manifest map[string]any
	// User and Password are what /api/reskon/login accepts.
	User, Password string
	// Token is what a good login hands out.
	Token string
	// Logins counts calls to the login address.
	Logins int
	// Launches counts tickets handed out.
	Launches int
	// ReskonOrigin is the Reskon allowed to show the widget pages in a frame
	// (their frame-ancestors), e.g. http://192.168.0.8:8097. Empty: none.
	ReskonOrigin string
	// Now is the clock for tickets; tests move it.
	Now func() time.Time
	// FeedsOff makes every data feed answer 503 (SetFeedsOff, or POST
	// /api/test/feeds).
	FeedsOff bool

	tickets      map[string]time.Time // ticket -> when it stops working
	sessions     map[string]time.Time // page session -> when it stops working
	done         map[string]map[string]bool
	hook         Hook // what Reskon handed at connect_url (fake_changed.go)
	connectFails bool
	calls        sync.WaitGroup // calls to Reskon's hook still running
}

// Close waits for calls to Reskon still running, then stops the fake's
// server (if it has one).
func (f *Fake) Close() {
	f.calls.Wait()
	if f.Server != nil {
		f.Server.Close()
	}
}

// New starts a pretend habit tracker that signs in with a password, on a
// local test address.
func New() *Fake {
	f := NewFake()
	f.Server = httptest.NewServer(f.Handler())
	return f
}

// NewFake is the pretend habit tracker without a server, for Handler.
func NewFake() *Fake {
	f := &Fake{
		User: "aakash", Password: "habits-123", Token: "tok-123",
		Now: time.Now, tickets: map[string]time.Time{}, sessions: map[string]time.Time{}, done: map[string]map[string]bool{},
		Manifest: map[string]any{
			"reskon_app":  1,
			"id":          "habits",
			"name":        "Habits",
			"version":     "1.0.0",
			"home_url":    "/",
			"icon":        "check",
			"auth":        map[string]any{"kind": "password", "login_url": "/api/reskon/login"},
			"launch_url":  "/api/reskon/launch",
			"connect_url": ConnectPath,
			"widgets": append([]any{
				map[string]any{"id": "today", "title": "Today's habits", "kind": "page", "url": "/widgets/today", "size": map[string]any{"w": 4, "h": 4}, "style": "reskon"},
			}, dataWidgets()...),
		},
	}
	f.seedHistory()
	return f
}

// Handler serves the pretend app (the example plugin program uses it).
func (f *Fake) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/reskon-app.json", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(f.Manifest)
	})
	mux.HandleFunc("POST /api/reskon/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Username, Password string }
		readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		f.Logins++
		if body.Username != f.User || body.Password != f.Password {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"secret detail that must not be shown"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"token": f.Token})
	})
	f.pageRoutes(mux)
	f.dataRoutes(mux)
	f.changedRoutes(mux)
	return mux
}

// SetToken changes the token the app accepts (a withdrawn sign-in), safely
// while it is serving.
func (f *Fake) SetToken(t string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Token = t
}

// SetLogin changes the password and the token a good login hands out.
func (f *Fake) SetLogin(password, token string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Password, f.Token = password, token
}

// Set changes one top-level field of the description file.
func (f *Fake) Set(key string, v any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Manifest[key] = v
}
