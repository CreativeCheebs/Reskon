package auth

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"jitterbug/internal/db"
)

// Login checks a username and password and returns a new session token for
// the cookie. Unknown usernames take as long as wrong passwords, and
// repeated failures lock the username out for a while.
func (s *Store) Login(ctx context.Context, username, password, userAgent string) (*User, string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if s.locked(username) {
		return nil, "", ErrLocked
	}
	u, err := scanUser(s.sql.QueryRowContext(ctx, `SELECT `+userCols+` FROM user WHERE username = ?`, username))
	if err == db.ErrNotFound {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		s.recordFailure(username)
		return nil, "", ErrBadLogin
	}
	if err != nil {
		return nil, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.hash), []byte(password)) != nil || u.DisabledAt != nil {
		s.recordFailure(username)
		return nil, "", ErrBadLogin
	}
	s.clearFailures(username)
	token, err := s.newSession(ctx, u.ID, userAgent)
	return u, token, err
}

func (s *Store) newSession(ctx context.Context, userID int64, userAgent string) (string, error) {
	token := randomHex(32)
	now := time.Now()
	_, err := s.sql.ExecContext(ctx, `INSERT INTO login_session (token_hash, user_id, created_at, expires_at, user_agent)
		VALUES (?, ?, ?, ?, ?)`, tokenHash(token), userID, db.FormatTime(now), db.FormatTime(now.Add(SessionTTL)), userAgent)
	return token, err
}

// SessionUser resolves a cookie token to its user and slides the expiry.
func (s *Store) SessionUser(ctx context.Context, token string) (*User, error) {
	if token == "" {
		return nil, ErrNoSession
	}
	h := tokenHash(token)
	var userID int64
	var expires string
	err := s.sql.QueryRowContext(ctx, `SELECT user_id, expires_at FROM login_session WHERE token_hash = ?`, h).
		Scan(&userID, &expires)
	if err == sql.ErrNoRows {
		return nil, ErrNoSession
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if exp, err := db.ParseTime(expires); err != nil || now.After(exp) {
		s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE token_hash = ?`, h)
		return nil, ErrNoSession
	}
	u, err := s.GetUser(ctx, userID)
	if err != nil || u.DisabledAt != nil {
		return nil, ErrNoSession
	}
	// Slide the expiry at most once an hour, to avoid a write per request.
	if exp, _ := db.ParseTime(expires); exp.Sub(now) < SessionTTL-time.Hour {
		s.sql.ExecContext(ctx, `UPDATE login_session SET expires_at = ? WHERE token_hash = ?`,
			db.FormatTime(now.Add(SessionTTL)), h)
	}
	return u, nil
}

func (s *Store) Logout(ctx context.Context, token string) error {
	_, err := s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE token_hash = ?`, tokenHash(token))
	return err
}

// ChangePassword needs the current password; it signs out every other
// session of that user.
func (s *Store) ChangePassword(ctx context.Context, userID int64, current, next, keepToken string) error {
	u, err := s.GetUser(ctx, userID)
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.hash), []byte(current)) != nil {
		return &db.InvalidError{Msg: "current password is wrong"}
	}
	return s.setPassword(ctx, userID, next, keepToken)
}

// SetPassword is the admin reset: no current password, and it signs the
// user out everywhere.
func (s *Store) SetPassword(ctx context.Context, userID int64, next string) error {
	if _, err := s.GetUser(ctx, userID); err != nil {
		return err
	}
	return s.setPassword(ctx, userID, next, "")
}

func (s *Store) setPassword(ctx context.Context, userID int64, next, keepToken string) error {
	hash, err := hashPassword(next)
	if err != nil {
		return err
	}
	if _, err := s.sql.ExecContext(ctx, `UPDATE user SET password_hash = ? WHERE id = ?`, hash, userID); err != nil {
		return err
	}
	_, err = s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE user_id = ? AND token_hash <> ?`, userID, tokenHash(keepToken))
	return err
}

// SetAdmin and SetDisabled are admin actions. Neither may leave the server
// without an active admin. Disabling signs the user out; their data file is
// kept untouched.
func (s *Store) SetAdmin(ctx context.Context, userID int64, admin bool) error {
	if !admin {
		if err := s.keepAnAdmin(ctx, userID); err != nil {
			return err
		}
	}
	_, err := s.sql.ExecContext(ctx, `UPDATE user SET is_admin = ? WHERE id = ?`, admin, userID)
	return err
}

func (s *Store) SetDisabled(ctx context.Context, userID int64, disabled bool) error {
	if disabled {
		if err := s.keepAnAdmin(ctx, userID); err != nil {
			return err
		}
		if _, err := s.sql.ExecContext(ctx, `UPDATE user SET disabled_at = ? WHERE id = ?`, db.Now(), userID); err != nil {
			return err
		}
		_, err := s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE user_id = ?`, userID)
		return err
	}
	_, err := s.sql.ExecContext(ctx, `UPDATE user SET disabled_at = NULL WHERE id = ?`, userID)
	return err
}

// keepAnAdmin fails if userID is the only active admin.
func (s *Store) keepAnAdmin(ctx context.Context, userID int64) error {
	var others int
	err := s.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM user
		WHERE is_admin = 1 AND disabled_at IS NULL AND id <> ?`, userID).Scan(&others)
	if err != nil {
		return err
	}
	u, err := s.GetUser(ctx, userID)
	if err != nil {
		return err
	}
	if u.IsAdmin && u.DisabledAt == nil && others == 0 {
		return ErrLastAdmin
	}
	return nil
}

// ---------- lockout ----------

const (
	maxFailures  = 5
	lockoutAfter = 15 * time.Minute
)

type failures struct {
	count int
	first time.Time
}

func (s *Store) locked(username string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.fails[username]
	if f == nil {
		return false
	}
	if time.Since(f.first) > lockoutAfter {
		delete(s.fails, username)
		return false
	}
	return f.count >= maxFailures
}

func (s *Store) recordFailure(username string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.fails[username]
	if f == nil || time.Since(f.first) > lockoutAfter {
		f = &failures{first: time.Now()}
		s.fails[username] = f
	}
	f.count++
}

func (s *Store) clearFailures(username string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.fails, username)
}
