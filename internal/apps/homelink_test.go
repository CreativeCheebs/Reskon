package apps

import (
	"context"
	"path/filepath"
	"testing"
)

// home_link comes from the stored description and the app's address. This
// test is inside the package so it can store descriptions a live app would
// not give (a path prefix, a description that no longer resolves).
func TestHomeLinkFromStoredManifest(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "me.apps.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()

	add := func(id, address, manifest string) int64 {
		t.Helper()
		res, err := s.sql.ExecContext(ctx, `INSERT INTO app (app_id, name, address, manifest, auth_kind, status, checked_at, created_at)
			VALUES (?, ?, ?, ?, 'none', 'ok', '', '')`, id, id, address, manifest)
		if err != nil {
			t.Fatal(err)
		}
		n, _ := res.LastInsertId()
		return n
	}
	prefixed := add("prefixed", "http://host:5000/habits", `{"name":"prefixed","home_url":"/today"}`)
	broken := add("broken", "http://host:5000", `{"name":"broken","home_url":"http://elsewhere.example/x"}`)

	for id, want := range map[int64]string{
		prefixed: "http://host:5000/habits/today", // a base with a path prefix keeps it
		broken:   "",                              // cannot be resolved: no link, no failure
	} {
		a, err := s.Get(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if a.HomeLink != want {
			t.Errorf("app %d: home_link %q, want %q", id, a.HomeLink, want)
		}
	}
}
