package apps_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"jitterbug/internal/apps"
	"jitterbug/internal/apps/appstest"
)

// ticketOf reads the ticket from a page link's "#ticket=…".
func ticketOf(t *testing.T, link string) string {
	t.Helper()
	_, frag, ok := strings.Cut(link, "#")
	v, err := url.ParseQuery(frag)
	if !ok || err != nil || v.Get("ticket") == "" {
		t.Fatalf("no ticket in %s", link)
	}
	return v.Get("ticket")
}

// swap sends a ticket to the pretend plugin's page sign-in, as its page does.
func swap(t *testing.T, f *appstest.Fake, ticket string) int {
	t.Helper()
	b, _ := json.Marshal(map[string]string{"ticket": ticket})
	res, err := http.Post(f.URL+"/api/page/session", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, res.Body)
	res.Body.Close()
	return res.StatusCode
}

func TestLaunchGivesAOneTimeTicket(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	var later atomic.Int64 // seconds the clock is moved on
	f.Now = func() time.Time { return time.Now().Add(time.Duration(later.Load()) * time.Second) }
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()
	if _, err := s.Launch(ctx, c, "habits", "today"); err == nil || !strings.Contains(err.Error(), "not connected") {
		t.Fatalf("not connected: %v", err)
	}
	a, err := s.Connect(ctx, c, f.URL, apps.Credentials{Username: "aakash", Password: "habits-123"})
	if err != nil {
		t.Fatal(err)
	}

	link, err := s.Launch(ctx, c, "habits", "today")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(link.URL, f.URL+"/widgets/today#ticket=") || link.Origin != f.URL || link.Style != "reskon" || link.Title != "Today's habits" {
		t.Fatalf("link: %+v", link)
	}
	if strings.Contains(link.URL, f.Token) {
		t.Fatal("the token is in the page's address")
	}
	ticket := ticketOf(t, link.URL)
	if code := swap(t, f, ticket); code != 200 {
		t.Fatalf("first use = %d", code)
	}
	if code := swap(t, f, ticket); code != 401 {
		t.Errorf("second use = %d", code)
	}
	// Past 60 seconds a ticket no longer works.
	link, _ = s.Launch(ctx, c, "habits", "today")
	later.Store(61)
	if code := swap(t, f, ticketOf(t, link.URL)); code != 401 {
		t.Errorf("old ticket = %d", code)
	}

	// A data widget, or one the app no longer offers, has no page.
	if _, err := s.Launch(ctx, c, "habits", "last_days"); err == nil {
		t.Error("launched a data widget")
	}
	var gone *apps.Gone
	if _, err := s.Launch(ctx, c, "habits", "gone"); !errors.As(err, &gone) {
		t.Errorf("missing page: %v", err)
	}

	// The app withdrew the token: sign in again, and its reply is not shown.
	f.SetToken("tok-other")
	if _, err := s.Launch(ctx, c, "habits", "today"); err == nil || !strings.Contains(err.Error(), "sign in to Habits again") || strings.Contains(err.Error(), "secret") {
		t.Errorf("withdrawn token: %v", err)
	}
	f.SetToken("tok-123")

	// Another app answers at the address now: it is never sent the token.
	f.Set("id", "food")
	if _, err := s.Check(ctx, c, a.ID); err != nil {
		t.Fatal(err)
	}
	n := f.Launches
	if _, err := s.Launch(ctx, c, "habits", "today"); err == nil || f.Launches != n {
		t.Errorf("asked whatever answers now for a ticket: %v", err)
	}
	f.Set("id", "habits")

	// Down: a clear message, not the app's.
	f.Close()
	var un *apps.Unreachable
	if _, err := s.Check(ctx, c, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Launch(ctx, c, "habits", "today"); !errors.As(err, &un) {
		t.Errorf("app down: %v", err)
	}
}

func TestLaunchWithoutSignIn(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	f.Set("auth", map[string]any{"kind": "none"})
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()
	if _, err := s.Connect(ctx, c, f.URL, apps.Credentials{}); err != nil {
		t.Fatal(err)
	}
	link, err := s.Launch(ctx, c, "habits", "today")
	if err != nil || link.URL != f.URL+"/widgets/today" || f.Launches != 0 {
		t.Fatalf("no sign-in: %+v %v (launches %d)", link, err, f.Launches)
	}
}

func httptestServer(t *testing.T, h http.Handler) string {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv.URL
}

// A ticket that would add to the page's address is refused or escaped.
func TestLaunchTicketCannotChangeTheAddress(t *testing.T) {
	var answer atomic.Value
	answer.Store(`{"ticket":"a&theme=x#y"}`)
	mux := http.NewServeMux()
	f := appstest.NewFake()
	mux.Handle("/", f.Handler())
	mux.HandleFunc("POST /api/reskon/launch", func(w http.ResponseWriter, r *http.Request) {
		if a := answer.Load().(string); a == "403" {
			w.WriteHeader(http.StatusForbidden)
		} else {
			_, _ = w.Write([]byte(a))
		}
	})
	srv := httptestServer(t, mux)
	s := open(t)
	c := &apps.Client{}
	ctx := context.Background()
	if _, err := s.Connect(ctx, c, srv, apps.Credentials{Username: "aakash", Password: "habits-123"}); err != nil {
		t.Fatal(err)
	}
	link, err := s.Launch(ctx, c, "habits", "today")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(link.URL, "#ticket=a%26theme%3Dx%23y") {
		t.Errorf("ticket not escaped: %s", link.URL)
	}
	// A 403 from the app means the same as a 401: sign in again.
	answer.Store("403")
	if _, err := s.Launch(ctx, c, "habits", "today"); err == nil || !strings.Contains(err.Error(), "sign in to Habits again") {
		t.Errorf("403: %v", err)
	}
	for _, bad := range []string{`{"ticket":"a b"}`, `{"ticket":"é"}`, `{"ticket":""}`, `{"ticket":"` + strings.Repeat("x", 1025) + `"}`, `not json`} {
		answer.Store(bad)
		if _, err := s.Launch(ctx, c, "habits", "today"); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}
