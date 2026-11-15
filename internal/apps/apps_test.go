package apps_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"jitterbug/internal/apps"
	"jitterbug/internal/apps/appstest"
)

func TestNormalizeAddress(t *testing.T) {
	ok := map[string]string{
		"192.168.0.8:5000":            "http://192.168.0.8:5000",
		" http://192.168.0.8:5000/ ":  "http://192.168.0.8:5000",
		"https://habits.example/app/": "https://habits.example/app",
	}
	for in, want := range ok {
		if got, err := apps.NormalizeAddress(in); err != nil || got != want {
			t.Errorf("%q = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "ftp://x", "http://user:pw@x", "http://x/?a=1", "http://x/?", "http://x/#y", "http://"} {
		if _, err := apps.NormalizeAddress(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestResolveStaysOnTheAppsHost(t *testing.T) {
	base := "http://192.168.0.8:5000/habits"
	if got, _ := apps.Resolve(base, "/api/reskon/login"); got != "http://192.168.0.8:5000/habits/api/reskon/login" {
		t.Errorf("relative: %s", got)
	}
	if got, err := apps.Resolve(base, "http://192.168.0.8:5000/habits/x"); err != nil || got != "http://192.168.0.8:5000/habits/x" {
		t.Errorf("full, same address: %s %v", got, err)
	}
	for _, bad := range []string{
		"http://192.168.0.9:5000/x", "//evil.example/x", "https://192.168.0.8:5000/x",
		"http://192.168.0.8:5000/food/login", // another app behind the same server
		"../food/login", "/habits/../../food",
		"http://u:p@192.168.0.8:5000/habits/x",
	} {
		if _, err := apps.Resolve(base, bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestParseManifestRejectsWhatItCannotUse(t *testing.T) {
	base := "http://h:1"
	good := `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"data","shape":"series","url":"/a"}]}`
	m, err := apps.ParseManifest(base, []byte(good))
	if err != nil {
		t.Fatal(err)
	}
	if m.HomeURL != "/" || m.Widgets[0].Size.W != 4 || m.Widgets[0].Size.H != 4 {
		t.Errorf("defaults not filled: %+v", m)
	}
	bad := map[string]string{
		"not json":                   `{`,
		"newer contract":             `{"reskon_app":2,"id":"habits","name":"Habits","auth":{"kind":"none"}}`,
		"bad id":                     `{"reskon_app":1,"id":"Habits!","name":"Habits","auth":{"kind":"none"}}`,
		"no name":                    `{"reskon_app":1,"id":"habits","name":" ","auth":{"kind":"none"}}`,
		"bad auth":                   `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"magic"}}`,
		"password, no login address": `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"password"}}`,
		"login elsewhere":            `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"password","login_url":"http://evil/x"}}`,
		"unknown shape":              `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"data","shape":"pie","url":"/a"}]}`,
		"twice the same widget":      `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"page","url":"/a"},{"id":"a","title":"B","kind":"page","url":"/b"}]}`,
		"widget too wide":            `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"page","url":"/a","size":{"w":13,"h":2}}]}`,
		"widget address elsewhere":   `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"page","url":"http://evil/a"}]}`,
		"direction trick in a name":  "{\"reskon_app\":1,\"id\":\"habits\",\"name\":\"Hab\u202eits\",\"auth\":{\"kind\":\"none\"}}",
		"odd group":                  `{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"a","title":"A","kind":"data","shape":"series","url":"/a","groups":["Day!"]}]}`,
	}
	for name, body := range bad {
		var inv *apps.Invalid
		if _, err := apps.ParseManifest(base, []byte(body)); !errors.As(err, &inv) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func open(t *testing.T) *apps.Store {
	t.Helper()
	s, err := apps.Open(filepath.Join(t.TempDir(), "me.apps.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestConnectCheckSignInRemove(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()

	if _, err := s.Connect(ctx, c, f.URL, apps.Credentials{Username: "aakash", Password: "wrong"}); err == nil ||
		!strings.Contains(err.Error(), "wrong") || strings.Contains(err.Error(), "secret") {
		t.Fatalf("wrong password: %v", err)
	}
	a, err := s.Connect(ctx, c, f.URL+"/", apps.Credentials{Username: "aakash", Password: "habits-123"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name != "Habits" || a.Address != f.URL || !a.SignedIn || a.Token() != "tok-123" || a.Status != apps.StatusOK || len(a.Manifest.Widgets) != 5 {
		t.Fatalf("connected: %+v", a)
	}
	if _, err := s.Connect(ctx, c, f.URL, apps.Credentials{Username: "aakash", Password: "habits-123"}); err == nil {
		t.Error("the same app connected twice")
	}

	// The app changes its name: a check picks it up.
	f.Set("name", "Habit tracker")
	if a, err = s.Check(ctx, c, a.ID); err != nil || a.Name != "Habit tracker" || a.Status != apps.StatusOK {
		t.Fatalf("check: %+v %v", a, err)
	}
	// Another app now answers at that address: the old description is kept.
	f.Set("id", "food")
	if a, err = s.Check(ctx, c, a.ID); err != nil || a.Status != apps.StatusInvalid || a.Manifest.ID != "habits" {
		t.Fatalf("other app at the address: %+v %v", a, err)
	}
	// While another app answers there, it is never sent the password.
	logins := f.Logins
	if _, err := s.SignIn(ctx, c, a.ID, apps.Credentials{Username: "aakash", Password: "habits-123"}); err == nil || f.Logins != logins {
		t.Fatalf("signed in to whatever answers now: %v", err)
	}
	f.Set("id", "habits")
	if a, err = s.Check(ctx, c, a.ID); err != nil || a.Status != apps.StatusOK {
		t.Fatalf("back: %+v %v", a, err)
	}

	// The password changed in the app: sign in again.
	f.SetLogin("new-pass", "tok-456")
	if a, err = s.SignIn(ctx, c, a.ID, apps.Credentials{Username: "aakash", Password: "new-pass"}); err != nil || a.Token() != "tok-456" {
		t.Fatalf("sign in again: %+v %v", a, err)
	}

	// Down: the app is kept, marked unreachable.
	f.Close()
	if a, err = s.Check(ctx, c, a.ID); err != nil || a.Status != apps.StatusUnreachable || a.Name != "Habit tracker" {
		t.Fatalf("app down: %+v %v", a, err)
	}

	if err := s.Remove(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, a.ID); !errors.Is(err, apps.ErrNotFound) {
		t.Errorf("after remove: %v", err)
	}
}

func TestTokenAndNoSignIn(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()
	f.Set("auth", map[string]any{"kind": "token"})
	if _, err := s.Connect(ctx, c, f.URL, apps.Credentials{}); err == nil {
		t.Error("token app connected without a token")
	}
	a, err := s.Connect(ctx, c, f.URL, apps.Credentials{Token: "  pasted  "})
	if err != nil || a.Token() != "pasted" {
		t.Fatalf("token: %+v %v", a, err)
	}
	// The app stops asking for a sign-in: the old token is dropped.
	f.Set("auth", map[string]any{"kind": "none"})
	if a, err = s.Check(ctx, c, a.ID); err != nil || a.Token() != "" || !a.SignedIn {
		t.Fatalf("kind changed: %+v %v", a, err)
	}
	if f.Logins != 0 {
		t.Errorf("a token app was sent a login %d times", f.Logins)
	}
}

func TestClientLimits(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/redirect/.well-known/reskon-app.json", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/", http.StatusFound)
	})
	mux.HandleFunc("/big/.well-known/reskon-app.json", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat(" ", apps.MaxReply+10)))
	})
	mux.HandleFunc("/locked/.well-known/reskon-app.json", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "sign in", http.StatusUnauthorized)
	})
	mux.HandleFunc("/error/.well-known/reskon-app.json", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal secret", http.StatusInternalServerError)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := &apps.Client{}
	ctx := context.Background()
	for path, want := range map[string]string{"/redirect": "redirect", "/big": "larger than 1 MB", "/error": "HTTP 500", "/missing": "description file is missing", "/locked": "readable without signing in"} {
		_, err := c.Describe(ctx, srv.URL+path)
		var un *apps.Unreachable
		if !errors.As(err, &un) || !strings.Contains(un.Msg, want) || strings.Contains(un.Msg, "secret") {
			t.Errorf("%s: %v", path, err)
		}
	}
}

// The browser opens an app's page from home_link and never works out
// addresses itself; the sign-in token must not be in what it is sent.
func TestHomeLinkIsResolvedAndTokenNeverSent(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()

	f.Set("home_url", "/today")
	a, err := s.Connect(ctx, c, f.URL, apps.Credentials{Username: "aakash", Password: "habits-123"})
	if err != nil {
		t.Fatal(err)
	}
	if a.HomeLink != f.URL+"/today" {
		t.Errorf("home_link = %q, want %q", a.HomeLink, f.URL+"/today")
	}
	listed, err := s.List(ctx)
	if err != nil || len(listed) != 1 || listed[0].HomeLink != f.URL+"/today" {
		t.Fatalf("list: %+v %v", listed, err)
	}
	raw, err := json.Marshal(listed)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"home_link"`) || strings.Contains(string(raw), "tok-123") {
		t.Errorf("app JSON: %s", raw)
	}
}
