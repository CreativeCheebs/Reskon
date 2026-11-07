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
	if s.locked(ctx, username) {
		return nil, "", ErrLocked
	}
	u, err := scanUser(s.sql.QueryRowContext(ctx, `SELECT `+userCols+` FROM user WHERE username = ?`, username))
	if err == db.ErrNotFound {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password)) // same work as a real check, so timing does not reveal the name
		s.recordFailure(ctx, username)
		return nil, "", ErrBadLogin
	}
	if err != nil {
		return nil, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.hash), []byte(password)) != nil || u.DisabledAt != nil {
		s.recordFailure(ctx, username)
		return nil, "", ErrBadLogin
	}
	s.clearFailures(ctx, username)
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
		_, _ = s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE token_hash = ?`, h) // tidy-up only; the session is refused either way
		return nil, ErrNoSession
	}
	u, err := s.GetUser(ctx, userID)
	if err != nil || u.DisabledAt != nil {
		return nil, ErrNoSession
	}
	// Slide the expiry at most once an hour, to avoid a write per request.
	if exp, _ := db.ParseTime(expires); exp.Sub(now) < SessionTTL-time.Hour {
		// If this fails the session simply keeps its old expiry.
		_, _ = s.sql.ExecContext(ctx, `UPDATE login_session SET expires_at = ? WHERE token_hash = ?`,
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
	// Guessing the current password from a signed-in session is limited the
	// same way as guessing at sign-in.
	guess := "password:" + u.Username
	if s.locked(ctx, guess) {
		return ErrLocked
	}
	if bcrypt.CompareHashAndPassword([]byte(u.hash), []byte(current)) != nil {
		s.recordFailure(ctx, guess)
		return &db.InvalidError{Msg: "current password is wrong"}
	}
	s.clearFailures(ctx, guess)
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
	maxFailures       = 5                // wrong passwords for one name from one client
	maxClientFailures = 30               // wrong passwords from one client, any names
	lockoutAfter      = 15 * time.Minute // how long failures are remembered
	maxTracked        = 5000             // most failure records kept in memory
)

type failures struct {
	count int
	first time.Time
}

type clientKey struct{}

// WithClient says where a request came from (an IP address), so a lockout
// affects the one who failed rather than everyone using that name. "" (a
// phone's own core, tests) is a single anonymous client.
func WithClient(ctx context.Context, client string) context.Context {
	return context.WithValue(ctx, clientKey{}, client)
}

func clientOf(ctx context.Context) string {
	c, _ := ctx.Value(clientKey{}).(string)
	return c
}

func nameKey(ctx context.Context, name string) string { return name + "|" + clientOf(ctx) }
func clientOnlyKey(ctx context.Context) string        { return "|" + clientOf(ctx) }

func (s *Store) locked(ctx context.Context, username string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.overLocked(nameKey(ctx, username), maxFailures) {
		return true
	}
	return clientOf(ctx) != "" && s.overLocked(clientOnlyKey(ctx), maxClientFailures)
}

// overLocked reports whether key has used up its failures, forgetting it if
// the memory has run out.
func (s *Store) overLocked(key string, limit int) bool {
	f := s.fails[key]
	if f == nil {
		return false
	}
	if time.Since(f.first) > lockoutAfter {
		delete(s.fails, key)
		return false
	}
	return f.count >= limit
}

func (s *Store) recordFailure(ctx context.Context, username string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bump(nameKey(ctx, username))
	if clientOf(ctx) != "" {
		s.bump(clientOnlyKey(ctx))
	}
	if len(s.fails) > maxTracked {
		s.forget()
	}
}

func (s *Store) bump(key string) {
	f := s.fails[key]
	if f == nil || time.Since(f.first) > lockoutAfter {
		f = &failures{first: time.Now()}
		s.fails[key] = f
	}
	f.count++
}

// forget drops records that have expired, and if that is not enough, the
// oldest, so random names cannot grow the map without limit.
func (s *Store) forget() {
	for k, f := range s.fails {
		if time.Since(f.first) > lockoutAfter {
			delete(s.fails, k)
		}
	}
	for len(s.fails) > maxTracked {
		var oldestKey string
		var oldest time.Time
		for k, f := range s.fails {
			if oldestKey == "" || f.first.Before(oldest) {
				oldestKey, oldest = k, f.first
			}
		}
		delete(s.fails, oldestKey)
	}
}

func (s *Store) clearFailures(ctx context.Context, username string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.fails, nameKey(ctx, username))
}

// PurgeExpiredSessions deletes login sessions that ended before now. Without
// it a session nobody uses again would stay in auth.db for ever.
func (s *Store) PurgeExpiredSessions(ctx context.Context, now time.Time) (int64, error) {
	res, err := s.sql.ExecContext(ctx, `DELETE FROM login_session WHERE expires_at < ?`, db.FormatTime(now))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
