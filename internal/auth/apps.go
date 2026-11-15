package auth

import (
	"context"
	"os"
	"path/filepath"
	"strings"

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
func (s *Store) AppsFor(ctx context.Context, userID int64) (*apps.Store, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a, ok := s.appsPool[userID]; ok {
		return a, nil
	}
	path, err := s.userPath(ctx, userID)
	if err != nil {
		return nil, err
	}
	a, err := apps.Open(appsPath(path))
	if err != nil {
		return nil, err
	}
	s.appsPool[userID] = a
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
	return copyTo(p, filepath.Join("apps", name+".db"))
}
