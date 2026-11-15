package auth

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"jitterbug/internal/apps"
	"jitterbug/internal/apps/appstest"
)

func countIn(t *testing.T, path, query string) int {
	t.Helper()
	d, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var n int
	if err := d.QueryRow(query).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// A backup copies the connected apps and their sign-ins but not the cache,
// which is rebuilt by fetching again; an apps file from before the cache
// still backs up.
func TestBackupLeavesTheCacheOut(t *testing.T) {
	f := appstest.New()
	defer f.Close()
	dir := t.TempDir()
	s, err := Open(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	alice, _ := s.Setup(ctx, "alice", "right password")
	bob, err := s.CreateUser(ctx, "bob", "bobs password", false)
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.AppsFor(ctx, alice.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.Connect(ctx, &apps.Client{}, f.URL, apps.Credentials{Username: "aakash", Password: "habits-123"}); err != nil {
		t.Fatal(err)
	}
	req := apps.DataRequest{App: "habits", Widget: "today_list", TZ: "UTC", Today: time.Now().Format("2006-01-02"), Viz: "checklist"}
	if _, err := a.Data(ctx, &apps.Client{}, req); err != nil {
		t.Fatal(err)
	}
	live := appsPath(filepath.Join(dir, alice.dbFile))
	if countIn(t, live, `SELECT COUNT(*) FROM app_cache`) != 1 {
		t.Fatal("nothing was cached")
	}
	// Bob's apps file is from before the cache: only the app table.
	bobApps := appsPath(filepath.Join(dir, bob.dbFile))
	d, err := sql.Open("sqlite", "file:"+bobApps)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`CREATE TABLE app (id INTEGER PRIMARY KEY, app_id TEXT); PRAGMA user_version = 1`); err != nil {
		t.Fatal(err)
	}
	d.Close()
	s.Close()

	written, err := Backup(dir, filepath.Join(dir, "bk"))
	if err != nil {
		t.Fatal(err)
	}
	copyOf := filepath.Join(dir, "bk", "apps", "alice.db")
	if len(written) != 5 || !strings.HasSuffix(written[2], filepath.Join("apps", "alice.db")) {
		t.Fatalf("written = %v", written)
	}
	if countIn(t, copyOf, `SELECT COUNT(*) FROM app`) != 1 || countIn(t, copyOf, `SELECT COUNT(*) FROM app_cache`) != 0 {
		t.Error("the backup should keep the app and leave its cache out")
	}
	// Not even in the file's free space: the answer named "Meditate".
	if raw, _ := os.ReadFile(copyOf); strings.Contains(string(raw), "Meditate") {
		t.Error("the backup still holds the cache's bytes")
	}
	if countIn(t, live, `SELECT COUNT(*) FROM app_cache`) != 1 {
		t.Error("the backup emptied the live cache")
	}
	if _, err := os.Stat(filepath.Join(dir, "bk", "apps", "bob.db")); err != nil {
		t.Errorf("an apps file from before the cache was not backed up: %v", err)
	}
	if countIn(t, filepath.Join(dir, "bk", "apps", "bob.db"), `PRAGMA user_version`) != 1 {
		t.Error("the backup migrated a file")
	}
}
