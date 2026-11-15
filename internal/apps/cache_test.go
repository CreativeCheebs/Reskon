package apps_test

import (
	"context"
	"net/http"
	"sync"
	"testing"

	"jitterbug/internal/apps"
)

// numberApp is a tiny app with no sign-in whose data widgets a, b, c and d
// each answer the same number, so every kept answer is the same size.
type numberApp struct {
	mu    sync.Mutex
	id    string
	shape string // of widget a
	down  bool
	URL   string
}

func newNumberApp(t *testing.T, id string) *numberApp {
	n := &numberApp{id: id, shape: "number"}
	n.URL = httptestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.mu.Lock()
		defer n.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == apps.ManifestPath {
			_, _ = w.Write([]byte(`{"reskon_app":1,"id":"` + n.id + `","name":"N","auth":{"kind":"none"},"widgets":[
				{"id":"a","title":"A","kind":"data","shape":"` + n.shape + `","url":"/a"},
				{"id":"b","title":"B","kind":"data","shape":"number","url":"/b"},
				{"id":"c","title":"C","kind":"data","shape":"number","url":"/c"},
				{"id":"d","title":"D","kind":"data","shape":"number","url":"/d"}]}`))
			return
		}
		if n.down {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{"shape":"number","value":7}`))
	}))
	return n
}

func (n *numberApp) set(f func(n *numberApp)) {
	n.mu.Lock()
	defer n.mu.Unlock()
	f(n)
}

func ask(t *testing.T, s *apps.Store, app, widget string) *apps.DataResult {
	t.Helper()
	res, err := s.Data(context.Background(), &apps.Client{}, apps.DataRequest{App: app, Widget: widget, TZ: "UTC", Today: "2026-11-15", Viz: "number"})
	if err != nil {
		t.Fatalf("%s/%s: %v", app, widget, err)
	}
	return res
}

func kept(t *testing.T, path, app, widget string) bool {
	t.Helper()
	return count(t, path, `SELECT COUNT(*) FROM app_cache c JOIN app a ON a.id = c.app WHERE a.app_id = ? AND c.widget = ?`, app, widget) == 1
}

// With answers all the same size, exactly the least recently read go first:
// stored a, b, c, then a read again, then d stored with room for two keeps
// a and d.
func TestCacheDropsLeastRecentlyReadFirst(t *testing.T) {
	defer func(l int64) { apps.CacheLimit = l }(apps.CacheLimit)
	n := newNumberApp(t, "n")
	s, path := openAt(t)
	ctx := context.Background()
	a, err := s.Connect(ctx, &apps.Client{}, n.URL, apps.Credentials{})
	if err != nil {
		t.Fatal(err)
	}
	ask(t, s, "n", "a")
	one, _ := s.CacheSize(ctx, a.ID)
	ask(t, s, "n", "b")
	ask(t, s, "n", "c")
	if all, _ := s.CacheSize(ctx, a.ID); all != 3*one {
		t.Fatalf("answers differ in size: %d for three of %d", all, one)
	}
	n.set(func(n *numberApp) { n.down = true })
	if !ask(t, s, "n", "a").Stale {
		t.Fatal("a was not read from the copy")
	}
	n.set(func(n *numberApp) { n.down = false })
	apps.CacheLimit = 2 * one
	ask(t, s, "n", "d")
	for w, want := range map[string]bool{"a": true, "b": false, "c": false, "d": true} {
		if kept(t, path, "n", w) != want {
			t.Errorf("%s kept = %v, want %v", w, !want, want)
		}
	}
}

// All of a person's apps together keep at most PersonCacheLimit, the least
// recently read across apps going first.
func TestCachePersonLimitAcrossApps(t *testing.T) {
	defer func(l int64) { apps.PersonCacheLimit = l }(apps.PersonCacheLimit)
	one, two := newNumberApp(t, "one"), newNumberApp(t, "two")
	s, path := openAt(t)
	ctx := context.Background()
	for _, n := range []*numberApp{one, two} {
		if _, err := s.Connect(ctx, &apps.Client{}, n.URL, apps.Credentials{}); err != nil {
			t.Fatal(err)
		}
	}
	ask(t, s, "one", "a")
	first, _ := s.CacheSize(ctx, 1)
	ask(t, s, "one", "b")
	ask(t, s, "two", "a")
	apps.PersonCacheLimit = 2 * first
	ask(t, s, "two", "b")
	if kept(t, path, "one", "a") || kept(t, path, "one", "b") || !kept(t, path, "two", "a") || !kept(t, path, "two", "b") {
		t.Error("the person's limit did not drop the least recently read across apps")
	}
}

// A kept copy in a shape the widget no longer has is never shown: it is
// dropped, and with the app down there is then no copy.
func TestCacheCopyInAnOldShapeIsDropped(t *testing.T) {
	n := newNumberApp(t, "n")
	s, path := openAt(t)
	ctx := context.Background()
	a, err := s.Connect(ctx, &apps.Client{}, n.URL, apps.Credentials{})
	if err != nil {
		t.Fatal(err)
	}
	ask(t, s, "n", "a")
	n.set(func(n *numberApp) { n.shape, n.down = "list", true })
	if _, err := s.Check(ctx, &apps.Client{}, a.ID); err != nil {
		t.Fatal(err)
	}
	// Drawn as a number, the widget must be edited first.
	if _, err := s.Data(ctx, &apps.Client{}, apps.DataRequest{App: "n", Widget: "a", TZ: "UTC", Today: "2026-11-15", Viz: "number"}); err == nil {
		t.Error("a number chart drew a list")
	}
	if _, err := s.Data(ctx, &apps.Client{}, apps.DataRequest{App: "n", Widget: "a", TZ: "UTC", Today: "2026-11-15", Viz: "list"}); err == nil {
		t.Error("the old number copy was shown as a list")
	}
	if kept(t, path, "n", "a") {
		t.Error("the copy in the old shape was kept")
	}
}
