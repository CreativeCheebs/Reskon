package apps_test

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"jitterbug/internal/apps"
	"jitterbug/internal/apps/appstest"
)

// openAt opens an apps file at a known path, so a test can look inside it.
func openAt(t *testing.T) (*apps.Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "me.apps.db")
	s, err := apps.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

func connectFake(t *testing.T, s *apps.Store, f *appstest.Fake) *apps.App {
	t.Helper()
	a, err := s.Connect(context.Background(), &apps.Client{}, f.URL, apps.Credentials{Username: "aakash", Password: "habits-123"})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func req(widget, viz string) apps.DataRequest {
	return apps.DataRequest{App: "habits", Widget: widget, TZ: "Asia/Kolkata", Today: time.Now().Format("2006-01-02"), Viz: viz}
}

// A data widget is fetched fresh with the token, the range and the group;
// with its app down, the last copy is shown, marked stale with when it was
// made and why; with no copy, the error says why, never in the app's words.
func TestDataFreshThenStale(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	var asked url.Values
	var mu sync.Mutex
	inner := f.Server.Config.Handler
	f.Server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/feeds/") {
			mu.Lock()
			asked = r.URL.Query()
			mu.Unlock()
		}
		inner.ServeHTTP(w, r)
	})
	// What the feed was last asked, read under the lock the handler writes it with.
	last := func() url.Values {
		mu.Lock()
		defer mu.Unlock()
		return asked
	}
	s, _ := openAt(t)
	connectFake(t, s, f)
	ctx := context.Background()
	c := &apps.Client{}

	r := req("last_days", "bar")
	r.Range, r.Group = "7d", "week"
	res, err := s.Data(ctx, c, r)
	if err != nil {
		t.Fatal(err)
	}
	today := time.Now().Format("2006-01-02")
	from := time.Now().AddDate(0, 0, -6).Format("2006-01-02")
	if a := last(); a.Get("from") != from || a.Get("to") != today || a.Get("group") != "week" || a.Get("tz") != "Asia/Kolkata" {
		t.Errorf("asked %v", a)
	}
	if res.Stale || res.Shape != "series" || res.Group != "week" || len(res.Points) == 0 || res.FetchedAt == "" {
		t.Errorf("fresh: %+v", res)
	}
	// The dashboard's dates replace the widget's range.
	r.From, r.To = "2026-11-01", "2026-11-03"
	if _, err := s.Data(ctx, c, r); err != nil || last().Get("from") != "2026-11-01" || last().Get("to") != "2026-11-03" {
		t.Errorf("dates: %v %v", last(), err)
	}
	r.From, r.To = "", ""

	// A feed with no range and no groups is asked only for tz.
	list := req("today_list", "checklist")
	if res, err := s.Data(ctx, c, list); err != nil || len(res.Points) != 3 || res.Total != 0 {
		t.Fatalf("checklist: %+v %v", res, err)
	}
	if a := last(); a.Has("from") || a.Get("group") != "" {
		t.Errorf("an unranged feed was asked %v", a)
	}

	// Off: the kept copy, marked stale.
	f.SetFeedsOff(true)
	f.Tick("walk", true)
	stale, err := s.Data(ctx, c, list)
	if err != nil {
		t.Fatal(err)
	}
	if !stale.Stale || stale.Total != 0 || !strings.Contains(stale.StaleReason, "Habits answered HTTP 503") || strings.Contains(stale.StaleReason, "secret") || strings.Contains(stale.StaleReason, "tz=") {
		t.Errorf("stale: %+v", stale)
	}
	// A cumulative chart of a stale copy still gets running totals.
	cum := req("last_days", "cumulative")
	cum.Range, cum.Group = "7d", "week"
	if res, err := s.Data(ctx, c, cum); err != nil || !res.Stale || !res.Cumulative {
		t.Errorf("stale cumulative: %+v %v", res, err)
	}
	// Nothing kept for these parameters: an error, in Reskon's words.
	other := req("last_days", "bar")
	other.Range = "30d"
	var un *apps.Unreachable
	if _, err := s.Data(ctx, c, other); !errors.As(err, &un) || strings.Contains(err.Error(), "secret") {
		t.Errorf("no copy: %v", err)
	}
	// Back on: fresh again, with the new tick.
	f.SetFeedsOff(false)
	if res, err := s.Data(ctx, c, list); err != nil || res.Stale || res.Total != 1 {
		t.Errorf("back on: %+v %v", res, err)
	}

	// A token the app no longer takes: the copy, with what to do.
	f.SetToken("changed")
	if res, err := s.Data(ctx, c, list); err != nil || !res.Stale || !strings.Contains(res.StaleReason, "sign in to Habits again") {
		t.Errorf("sign-in refused: %+v %v", res, err)
	}
	f.SetToken("tok-123")

	// Asking for something the app does not offer.
	if _, err := s.Data(ctx, c, req("nope", "bar")); err == nil {
		t.Error("unknown widget answered")
	}
	if _, err := s.Data(ctx, c, req("today", "bar")); err == nil {
		t.Error("a page widget answered as data")
	}
	bad := req("last_days", "bar")
	bad.Group = "month"
	if _, err := s.Data(ctx, c, bad); err == nil {
		t.Error("a group the feed does not list was asked")
	}
	if _, err := s.Data(ctx, c, apps.DataRequest{App: "food", Widget: "x"}); err == nil {
		t.Error("an app not connected answered")
	}

	// The app switched off altogether: the copy, and the reason names the
	// app, not its address and parameters.
	f.Close()
	res, err = s.Data(ctx, c, list)
	if err != nil || !res.Stale || !strings.Contains(res.StaleReason, "could not reach Habits") ||
		strings.Contains(res.StaleReason, "http://") || strings.Contains(res.StaleReason, "tz=") || strings.Contains(res.StaleReason, "from=") {
		t.Errorf("app off: %+v %v", res, err)
	}
}

// An answer that breaks the contract is not stored or shown: the copy from
// before is shown instead.
func TestDataBadAnswerKeepsTheCopy(t *testing.T) {
	var broken atomic.Bool
	srv := httptestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == apps.ManifestPath:
			_, _ = w.Write([]byte(`{"reskon_app":1,"id":"habits","name":"Habits","auth":{"kind":"none"},"widgets":[{"id":"n","title":"N","kind":"data","shape":"number","url":"/n"}]}`))
		case broken.Load():
			_, _ = w.Write([]byte(`{"shape":"number","value":"<script>secret</script>"}`))
		default:
			_, _ = w.Write([]byte(`{"shape":"number","value":7}`))
		}
	}))
	s, _ := openAt(t)
	ctx := context.Background()
	if _, err := s.Connect(ctx, &apps.Client{}, srv, apps.Credentials{}); err != nil {
		t.Fatal(err)
	}
	if res, err := s.Data(ctx, &apps.Client{}, req("n", "number")); err != nil || res.Total != 7 {
		t.Fatalf("first: %+v %v", res, err)
	}
	broken.Store(true)
	res, err := s.Data(ctx, &apps.Client{}, req("n", "number"))
	if err != nil || !res.Stale || res.Total != 7 || !strings.Contains(res.StaleReason, "Reskon cannot use") || strings.Contains(res.StaleReason, "secret") {
		t.Errorf("bad answer: %+v %v", res, err)
	}
}

func count(t *testing.T, path, query string, args ...any) int64 {
	t.Helper()
	d, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var n int64
	if err := d.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The cache keeps at most CacheLimit bytes per app, dropping the least
// recently read first; the file gives the space back; removing the app
// removes its answers.
func TestCacheLimitAndRemove(t *testing.T) {
	old := apps.CacheLimit
	defer func() { apps.CacheLimit = old }()
	f := appstest.New()
	defer f.Close()
	s, path := openAt(t)
	a := connectFake(t, s, f)
	ctx := context.Background()
	c := &apps.Client{}
	if n := count(t, path, `PRAGMA auto_vacuum`); n != 2 {
		t.Fatalf("auto_vacuum = %d, want 2 (incremental)", n)
	}

	ranges := []string{"7d", "30d", "90d", "1y"}
	for _, rng := range ranges {
		r := req("last_days", "bar")
		r.Range = rng
		if _, err := s.Data(ctx, c, r); err != nil {
			t.Fatal(err)
		}
	}
	all, _ := s.CacheSize(ctx, a.ID)
	if all == 0 || count(t, path, `SELECT COUNT(*) FROM app_cache`) != 4 {
		t.Fatalf("stored %d bytes", all)
	}
	// Read 7d again (from the copy, the app off), so 30d is now the least
	// recently read.
	f.SetFeedsOff(true)
	r := req("last_days", "bar")
	r.Range = "7d"
	if res, err := s.Data(ctx, c, r); err != nil || !res.Stale {
		t.Fatal(err)
	}
	f.SetFeedsOff(false)
	// Half of what is kept: storing one more drops the least recently read
	// (30d first) until the rest fits. Exact order is pinned in cache_test.go.
	apps.CacheLimit = all/2 + 1
	r.Range = "month"
	if _, err := s.Data(ctx, c, r); err != nil {
		t.Fatal(err)
	}
	size, _ := s.CacheSize(ctx, a.ID)
	if size > apps.CacheLimit {
		t.Errorf("kept %d bytes, limit %d", size, apps.CacheLimit)
	}
	if count(t, path, `SELECT COUNT(*) FROM app_cache WHERE params LIKE '%range=30d%'`) != 0 {
		t.Error("the least recently read answer was kept")
	}
	if count(t, path, `SELECT COUNT(*) FROM app_cache WHERE params LIKE '%range=month%'`) != 1 {
		t.Error("the answer just stored was dropped")
	}
	if n := count(t, path, `PRAGMA freelist_count`); n != 0 {
		t.Errorf("%d free pages left after dropping answers", n)
	}

	if err := s.Remove(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if count(t, path, `SELECT COUNT(*) FROM app_cache`) != 0 {
		t.Error("removing the app kept its cache")
	}
}

// An apps file made before the cache existed is switched to give space back
// when opened.
func TestOldFileGetsIncrementalVacuum(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.apps.db")
	d, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`CREATE TABLE app (id INTEGER PRIMARY KEY, app_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, address TEXT NOT NULL,
		manifest TEXT NOT NULL, auth_kind TEXT NOT NULL, token TEXT, status TEXT NOT NULL, status_detail TEXT NOT NULL DEFAULT '',
		checked_at TEXT NOT NULL, created_at TEXT NOT NULL); PRAGMA user_version = 1`); err != nil {
		t.Fatal(err)
	}
	d.Close()
	if count(t, path, `PRAGMA auto_vacuum`) != 0 {
		t.Fatal("test file should start without auto_vacuum")
	}
	s, err := apps.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	if count(t, path, `PRAGMA auto_vacuum`) != 2 || count(t, path, `SELECT COUNT(*) FROM sqlite_master WHERE name = 'app_cache'`) != 1 {
		t.Error("an old file was not upgraded")
	}
}
