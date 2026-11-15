// Package auth owns accounts, passwords and login sessions (auth.db), and
// opens each user's own Reskon database. Users never share data: each
// has a separate SQLite file with the ordinary schema.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"jitterbug/internal/apps"
	"jitterbug/internal/db"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// SessionTTL is how long a login lasts without being used. Each use
// extends it.
const SessionTTL = 30 * 24 * time.Hour

var (
	ErrBadLogin    = errors.New("wrong username or password")
	ErrLocked      = errors.New("too many failed attempts; try again in a few minutes")
	ErrSetupDone   = errors.New("setup has already been done")
	ErrNoSession   = errors.New("not signed in")
	ErrLastAdmin   = errors.New("cannot remove the last admin")
	usernameRe     = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{1,31}$`)
	minPasswordLen = 8
	// bcrypt of "timing-equaliser" at the default cost, written out so start-up
	// doesn't spend a hash on it (about 100 ms on a phone).
	dummyHash = []byte("$2a$10$u.BkUSYzsG2Bsemr7UEQtuVmCe0mGgs9rPsgtoNXgKLmLG/lqBGky")
)

// User is an account. PasswordHash and DBFile never leave the server.
type User struct {
	ID         int64   `json:"id"`
	Username   string  `json:"username"`
	IsAdmin    bool    `json:"is_admin"`
	CreatedAt  string  `json:"created_at"`
	DisabledAt *string `json:"disabled_at"`
	dbFile     string
	hash       string
}

// Store is auth.db plus the pool of open per-user databases.
type Store struct {
	sql     *sql.DB
	dataDir string
	legacy  string // pre-accounts database adopted by the first admin, if it exists

	setupMu sync.Mutex // serialises first-admin setup
	mu      sync.Mutex // guards pool and fails
	pool    map[int64]*db.DB
	// appsPool holds each person's connected-apps file (see apps.go).
	appsPool map[int64]*apps.Store
	fails    map[string]*failures
}

// Open opens (creating if needed) dataDir/auth.db. legacyDB is the path of
// a single-user jitterbug.db from before accounts existed; if that file
// exists when the first admin is created, it becomes the admin's database
// so no data is orphaned. It may be "".
func Open(dataDir, legacyDB string) (*Store, error) {
	if err := os.MkdirAll(filepath.Join(dataDir, "users"), 0o700); err != nil {
		return nil, err
	}
	sqldb, err := db.OpenMigrated(filepath.Join(dataDir, "auth.db"), migrationFS, "migrations")
	if err != nil {
		return nil, err
	}
	return &Store{sql: sqldb, dataDir: dataDir, legacy: legacyDB, pool: map[int64]*db.DB{}, appsPool: map[int64]*apps.Store{}, fails: map[string]*failures{}}, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.pool {
		d.Close()
	}
	for _, a := range s.appsPool {
		a.Close()
	}
	return s.sql.Close()
}

// NeedsSetup is true until the first account exists.
func (s *Store) NeedsSetup(ctx context.Context) (bool, error) {
	var n int
	err := s.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM user`).Scan(&n)
	return n == 0, err
}

// Setup creates the first account, as admin. It fails once any account
// exists, so it cannot be used to take over a running server.
func (s *Store) Setup(ctx context.Context, username, password string) (*User, error) {
	s.setupMu.Lock() // serialise two simultaneous setup attempts
	defer s.setupMu.Unlock()
	need, err := s.NeedsSetup(ctx)
	if err != nil {
		return nil, err
	}
	if !need {
		return nil, ErrSetupDone
	}
	file := ""
	if s.legacy != "" {
		if _, err := os.Stat(s.legacy); err == nil {
			if file, err = s.relPath(s.legacy); err != nil {
				return nil, err
			}
		}
	}
	return s.createUser(ctx, username, password, true, file)
}

// CreateUser adds an account (admin only, enforced by the caller).
func (s *Store) CreateUser(ctx context.Context, username, password string, admin bool) (*User, error) {
	return s.createUser(ctx, username, password, admin, "")
}

func (s *Store) createUser(ctx context.Context, username, password string, admin bool, file string) (*User, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if !usernameRe.MatchString(username) {
		return nil, &db.InvalidError{Msg: "username must be 2-32 characters: lower case letters, digits, . _ -"}
	}
	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}
	if file == "" {
		file = filepath.Join("users", username+"-"+randomHex(4)+".db")
	}
	res, err := s.sql.ExecContext(ctx, `INSERT INTO user (username, password_hash, is_admin, db_file, created_at)
		VALUES (?, ?, ?, ?, ?)`, username, hash, admin, file, db.Now())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, &db.ConflictError{Msg: "that username is taken"}
		}
		return nil, err
	}
	id, _ := res.LastInsertId()
	// Create and migrate the user's database now, so a broken data
	// directory shows up here rather than at first sign-in.
	if _, err := s.DBFor(ctx, id); err != nil {
		return nil, err
	}
	return s.GetUser(ctx, id)
}

func hashPassword(pw string) (string, error) {
	if len(pw) < minPasswordLen {
		return "", &db.InvalidError{Msg: fmt.Sprintf("password must be at least %d characters", minPasswordLen)}
	}
	if len(pw) > 72 { // bcrypt's limit
		return "", &db.InvalidError{Msg: "password must be at most 72 characters"}
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(h), err
}

const userCols = `id, username, is_admin, created_at, disabled_at, db_file, password_hash`

func scanUser(r interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := r.Scan(&u.ID, &u.Username, &u.IsAdmin, &u.CreatedAt, &u.DisabledAt, &u.dbFile, &u.hash)
	if err == sql.ErrNoRows {
		return nil, db.ErrNotFound
	}
	return &u, err
}

func (s *Store) GetUser(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.sql.QueryRowContext(ctx, `SELECT `+userCols+` FROM user WHERE id = ?`, id))
}

func (s *Store) ListUsers(ctx context.Context) ([]*User, error) {
	rows, err := s.sql.QueryContext(ctx, `SELECT `+userCols+` FROM user ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// DBFor returns the user's own database, opening it on first use.
func (s *Store) DBFor(ctx context.Context, userID int64) (*db.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if d, ok := s.pool[userID]; ok {
		return d, nil
	}
	var file string
	if err := s.sql.QueryRowContext(ctx, `SELECT db_file FROM user WHERE id = ?`, userID).Scan(&file); err != nil {
		return nil, err
	}
	path := file
	if !filepath.IsAbs(path) {
		path = filepath.Join(s.dataDir, file)
	}
	d, err := db.Open(path)
	if err != nil {
		return nil, err
	}
	s.pool[userID] = d
	return d, nil
}

// Backup writes a consistent copy of auth.db and every user's database
// into dest (one <username>.db each). It opens every file read-only and
// directly, never through Open/DBFor, so it never runs migrations: a backup
// taken with a newer binary is still a copy of the data as it was.
func Backup(dataDir, dest string) ([]string, error) {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return nil, err
	}
	readOnly := func(path string) (*sql.DB, error) {
		if _, err := os.Stat(path); err != nil {
			return nil, err
		}
		return sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	}
	copyTo := func(src *sql.DB, name string) (string, error) {
		out := filepath.Join(dest, name)
		if _, err := os.Stat(out); err == nil {
			return "", fmt.Errorf("%s already exists", out)
		}
		if _, err := src.Exec(`VACUUM INTO ?`, out); err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		return out, nil
	}

	authDB, err := readOnly(filepath.Join(dataDir, "auth.db"))
	if err != nil {
		return nil, fmt.Errorf("auth.db: %w", err)
	}
	defer authDB.Close()
	type entry struct{ name, file string }
	var users []entry
	rows, err := authDB.Query(`SELECT username, db_file FROM user ORDER BY id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.name, &e.file); err != nil {
			rows.Close()
			return nil, err
		}
		users = append(users, e)
	}
	rows.Close()

	written := []string{}
	out, err := copyTo(authDB, "auth.db")
	if err != nil {
		return written, err
	}
	written = append(written, out)
	for _, u := range users {
		path := u.file
		if !filepath.IsAbs(path) {
			path = filepath.Join(dataDir, u.file)
		}
		src, err := readOnly(path)
		if err != nil {
			return written, fmt.Errorf("%s: %w", u.name, err)
		}
		out, err := copyTo(src, u.name+".db")
		src.Close()
		if err != nil {
			return written, err
		}
		written = append(written, out)
		// Their connected apps (with the sign-ins), if any.
		out, err = backupApps(path, dest, u.name, func(p, name string) (string, error) {
			a, err := readOnly(p)
			if err != nil {
				return "", err
			}
			defer a.Close()
			return copyTo(a, name)
		})
		if err != nil {
			return written, fmt.Errorf("%s apps: %w", u.name, err)
		}
		if out != "" {
			written = append(written, out)
		}
	}
	return written, nil
}

// relPath stores p relative to the data directory when it can.
func (s *Store) relPath(p string) (string, error) {
	absData, err := filepath.Abs(s.dataDir)
	if err != nil {
		return "", err
	}
	absP, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	if rel, err := filepath.Rel(absData, absP); err == nil {
		return rel, nil
	}
	return absP, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // the OS random source failing is not recoverable
	}
	return hex.EncodeToString(b)
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
