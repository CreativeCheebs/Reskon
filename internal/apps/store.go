package apps

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"jitterbug/internal/db"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Store is one person's connected apps (their users/<name>-<id>.apps.db).
type Store struct {
	sql *sql.DB
}

// Open opens (creating if needed) a person's apps file.
func Open(path string) (*Store, error) {
	d, err := db.OpenMigrated(path, migrationFS, "migrations")
	if err != nil {
		return nil, err
	}
	return &Store{sql: d}, nil
}

func (s *Store) Close() error { return s.sql.Close() }

// Statuses.
const (
	StatusOK          = "ok"
	StatusUnreachable = "unreachable"
	StatusInvalid     = "invalid"
)

// App is a connected app as the browser sees it: everything but the token.
type App struct {
	ID           int64     `json:"id"`
	AppID        string    `json:"app_id"`
	Name         string    `json:"name"`
	Address      string    `json:"address"`
	AuthKind     string    `json:"auth_kind"`
	SignedIn     bool      `json:"signed_in"`
	Status       string    `json:"status"`
	StatusDetail string    `json:"status_detail"`
	CheckedAt    string    `json:"checked_at"`
	Manifest     *Manifest `json:"manifest"`
	token        string
}

// Token is what Reskon signs in to the app with. Server side only.
func (a *App) Token() string { return a.token }

// Credentials a person gives to sign in to an app: a token, or a username
// and password that are swapped for one and then forgotten.
type Credentials struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Password string `json:"password"`
}

const appCols = `id, app_id, name, address, manifest, auth_kind, token, status, status_detail, checked_at`

func scanApp(r interface{ Scan(...any) error }) (*App, error) {
	var a App
	var manifest string
	var token sql.NullString
	if err := r.Scan(&a.ID, &a.AppID, &a.Name, &a.Address, &manifest, &a.AuthKind, &token, &a.Status, &a.StatusDetail, &a.CheckedAt); err != nil {
		return nil, err
	}
	a.token = token.String
	a.SignedIn = a.AuthKind == AuthNone || a.token != ""
	var m Manifest
	if json.Unmarshal([]byte(manifest), &m) == nil {
		a.Manifest = &m
	}
	return &a, nil
}

// ErrNotFound is an app id that does not exist (for this person).
var ErrNotFound = errors.New("no such app")

func (s *Store) List(ctx context.Context) ([]*App, error) {
	rows, err := s.sql.QueryContext(ctx, `SELECT `+appCols+` FROM app ORDER BY name COLLATE NOCASE, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*App{}
	for rows.Next() {
		a, err := scanApp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, id int64) (*App, error) {
	a, err := scanApp(s.sql.QueryRowContext(ctx, `SELECT `+appCols+` FROM app WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return a, err
}

func now() string { return db.FormatTime(time.Now()) }

// token signs in as the app's description asks: nothing, the token given,
// or a username and password swapped for a token.
func signIn(ctx context.Context, c *Client, base string, m *Manifest, cr Credentials) (string, error) {
	switch m.Auth.Kind {
	case AuthNone:
		return "", nil
	case AuthToken:
		t := strings.TrimSpace(cr.Token)
		if t == "" {
			return "", invalid("paste the token %s gave you", m.Name)
		}
		if len(t) > 4096 {
			return "", invalid("the token is longer than 4096 characters")
		}
		return t, nil
	default:
		if strings.TrimSpace(cr.Username) == "" || cr.Password == "" {
			return "", invalid("type your %s username and password", m.Name)
		}
		return c.Login(ctx, base, m, strings.TrimSpace(cr.Username), cr.Password)
	}
}

// Preview reads an app's description without connecting it, so the person
// can see what it offers and how it signs in.
func Preview(ctx context.Context, c *Client, address string) (base string, m *Manifest, err error) {
	base, err = NormalizeAddress(address)
	if err != nil {
		return "", nil, err
	}
	m, err = c.Describe(ctx, base)
	return base, m, err
}

// Connect reads the app's description, signs in and saves it.
func (s *Store) Connect(ctx context.Context, c *Client, address string, cr Credentials) (*App, error) {
	base, m, err := Preview(ctx, c, address)
	if err != nil {
		return nil, err
	}
	var exists int
	if err := s.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM app WHERE app_id = ?`, m.ID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists > 0 {
		return nil, invalid("%s (id %q) is already connected; remove it first to connect it again", m.Name, m.ID)
	}
	token, err := signIn(ctx, c, base, m, cr)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(m)
	t := now()
	res, err := s.sql.ExecContext(ctx, `INSERT INTO app (app_id, name, address, manifest, auth_kind, token, status, checked_at, created_at)
		VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?)`, m.ID, m.Name, base, string(raw), m.Auth.Kind, token, StatusOK, t, t)
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		// Connected meanwhile (a second click, another tab).
		return nil, invalid("%s (id %q) is already connected", m.Name, m.ID)
	}
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.Get(ctx, id)
}

// Check reads the app's description again and records whether it answered.
// An app that is down keeps its last description, so it stays usable.
func (s *Store) Check(ctx context.Context, c *Client, id int64) (*App, error) {
	a, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	m, err := c.Describe(ctx, a.Address)
	status, detail := StatusOK, ""
	var inv *Invalid
	var un *Unreachable
	switch {
	case err == nil:
		if m.ID != a.AppID {
			status, detail = StatusInvalid, "the app at this address is now "+m.Name+" (id "+m.ID+"), not "+a.Name
			m = nil
		}
	case errors.As(err, &inv):
		status, detail = StatusInvalid, inv.Msg
	case errors.As(err, &un):
		status, detail = StatusUnreachable, un.Msg
	default:
		return nil, err
	}
	if m != nil {
		raw, _ := json.Marshal(m)
		// The sign-in kind follows the app; a changed kind needs a new sign-in.
		_, err = s.sql.ExecContext(ctx, `UPDATE app SET name = ?, manifest = ?, auth_kind = ?,
			token = CASE WHEN auth_kind = ? THEN token ELSE NULL END,
			status = ?, status_detail = ?, checked_at = ? WHERE id = ?`,
			m.Name, string(raw), m.Auth.Kind, m.Auth.Kind, status, detail, now(), id)
	} else {
		_, err = s.sql.ExecContext(ctx, `UPDATE app SET status = ?, status_detail = ?, checked_at = ? WHERE id = ?`, status, detail, now(), id)
	}
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// SignIn replaces the token, for a password changed in the app or a token
// it withdrew.
func (s *Store) SignIn(ctx context.Context, c *Client, id int64, cr Credentials) (*App, error) {
	a, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.Manifest == nil || a.Status == StatusInvalid {
		// Another app may answer at that address now: never send it the password.
		return nil, invalid("check %s again first: %s", a.Name, a.StatusDetail)
	}
	token, err := signIn(ctx, c, a.Address, a.Manifest, cr)
	if err != nil {
		return nil, err
	}
	// Only if the app still signs in the way it did when we started (a check
	// meanwhile may have changed it).
	res, err := s.sql.ExecContext(ctx, `UPDATE app SET token = NULLIF(?, '') WHERE id = ? AND auth_kind = ?`, token, id, a.Manifest.Auth.Kind)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, invalid("%s changed how it signs in meanwhile; try again", a.Name)
	}
	return s.Get(ctx, id)
}

// Remove forgets an app and its sign-in.
func (s *Store) Remove(ctx context.Context, id int64) error {
	res, err := s.sql.ExecContext(ctx, `DELETE FROM app WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
