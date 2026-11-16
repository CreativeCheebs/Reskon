package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"regexp"

	"jitterbug/internal/db"
)

// Keys for connected apps' "my data changed" calls (docs/plugins.md
// section 7). Each person has at most one key per app. A new key is made
// first, handed to the app, and only stored (replacing the old one) once the
// app has taken it, so a failed hand-over leaves the old key working. Only
// the key's hash is stored, as for sign-in cookies.

// NewHookKey makes a fresh random key (32 bytes, 43 characters).
func NewHookKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

var hookKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// ValidHookKey says whether key has the shape NewHookKey makes, so anything
// else can be ignored without touching the database.
func ValidHookKey(key string) bool { return hookKeyPattern.MatchString(key) }

// SetAppHook stores the key the app just took, replacing the person's
// earlier key for that app, in one transaction.
func (s *Store) SetAppHook(ctx context.Context, userID int64, appID, key string) error {
	tx, err := s.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM app_hook WHERE user_id = ? AND app_id = ?`, userID, appID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO app_hook (key_hash, user_id, app_id, created_at) VALUES (?, ?, ?, ?)`,
		HookHash(key), userID, appID, db.Now()); err != nil {
		return err
	}
	return tx.Commit()
}

// DropAppHook forgets a person's key for one app, if there is one (the app
// was removed, or no longer offers connect_url).
func (s *Store) DropAppHook(ctx context.Context, userID int64, appID string) error {
	_, err := s.sql.ExecContext(ctx, `DELETE FROM app_hook WHERE user_id = ? AND app_id = ?`, userID, appID)
	return err
}

// ErrNoHook is a key that is not (or no longer) any app's, or belongs to a
// disabled account.
var ErrNoHook = errors.New("no such key")

// AppHookOwner says whose app a key belongs to, from its hash (HookHash).
// Looking up the hash, never comparing keys one by one, means the time
// taken says nothing about how close a guess was.
func (s *Store) AppHookOwner(ctx context.Context, keyHash string) (userID int64, appID string, err error) {
	err = s.sql.QueryRowContext(ctx, `SELECT h.user_id, h.app_id FROM app_hook h JOIN user u ON u.id = h.user_id
		WHERE h.key_hash = ? AND u.disabled_at IS NULL`, keyHash).Scan(&userID, &appID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", ErrNoHook
	}
	return userID, appID, err
}

// HookHash is how a key is stored and looked up.
func HookHash(key string) string { return tokenHash(key) }
