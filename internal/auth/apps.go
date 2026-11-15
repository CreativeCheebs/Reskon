package auth

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"jitterbug/internal/apps"
)

// appsPath is a person's connected-apps file: beside their database, with
// .apps.db in place of .db (users/alice-1a2b.db → users/alice-1a2b.apps.db).
func appsPath(dbPath string) string {
	return strings.TrimSuffix(dbPath, filepath.Ext(dbPath)) + ".apps.db"
}

// userPath is the full path of a user's database file.
func (s *Store) userPath(ctx context.Context, userID int64) (string, error) {
	var file string
	if err := s.sql.QueryRowContext(ctx, `SELECT db_file FROM user WHERE id = ?`, userID).Scan(&file); err != nil {
		return "", err
	}
	if !filepath.IsAbs(file) {
		file = filepath.Join(s.dataDir, file)
	}
	return file, nil
}

// AppsFor returns the person's connected apps, opening the file on first
// use. It is kept apart from their database so app sign-ins never sync to
// a phone and never reach the browser with the settings.
//
// Opening may upgrade the file (and compact it once), so it happens under
// that person's own lock, not the server-wide one: one slow upgrade never
// holds up other people.
func (s *Store) AppsFor(ctx context.Context, userID int64) (*apps.Store, error) {
	s.mu.Lock()
	if a, ok := s.appsPool[userID]; ok {
		s.mu.Unlock()
		return a, nil
	}
	opening := s.appsOpening[userID]
	if opening == nil {
		opening = &sync.Mutex{}
		s.appsOpening[userID] = opening
	}
	s.mu.Unlock()

	opening.Lock()
	defer opening.Unlock()
	s.mu.Lock()
	a, ok := s.appsPool[userID] // opened meanwhile by another request
	s.mu.Unlock()
	if ok {
		return a, nil
	}
	path, err := s.userPath(ctx, userID)
	if err != nil {
		return nil, err
	}
	a, err = apps.Open(appsPath(path))
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.appsPool[userID] = a
	s.mu.Unlock()
	return a, nil
}

// backupApps copies a person's apps file, if they have one, as
// apps/<username>.db: a folder of its own, so it can never take the name of
// another person's backup (usernames may contain dots).
func backupApps(dbPath, dest, name string, copyTo func(path, name string) (string, error)) (string, error) {
	p := appsPath(dbPath)
	if _, err := os.Stat(p); err != nil {
		return "", nil // never connected an app
	}
	if err := os.MkdirAll(filepath.Join(dest, "apps"), 0o755); err != nil {
		return "", err
	}
	out, err := copyTo(p, filepath.Join("apps", name+".db"))
	if err != nil {
		return "", err
	}
	if err := dropCache(out); err != nil {
		// Never leave a copy that may still hold the cache.
		os.Remove(out)
		return "", err
	}
	return out, nil
}

// dropCache empties the cache in a backup's copy of an apps file: the cache
// is rebuilt by fetching again (docs/decisions.md). The copy is opened
// directly, never through apps.Open, so a backup never migrates; a file from
// before the cache existed has no cache table, and is left as it is. The
// VACUUM afterwards leaves no cached bytes in the copy's free pages.
func dropCache(path string) error {
	d, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return err
	}
	defer d.Close()
	var n int
	if err := d.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'app_cache'`).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	if _, err := d.Exec(`DELETE FROM app_cache`); err != nil {
		return err
	}
	_, err = d.Exec(`VACUUM`)
	return err
}
