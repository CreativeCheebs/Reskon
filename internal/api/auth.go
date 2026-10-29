package api

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	"jitterbug/internal/auth"
	"jitterbug/internal/db"
)

const cookieName = "jb_session"

// Reachable without signing in.
var publicPaths = map[string]bool{
	"/api/health":      true,
	"/api/auth/status": true,
	"/api/auth/setup":  true,
	"/api/auth/login":  true,
	"/api/auth/logout": true,
}

type userKey struct{}

func userOf(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userKey{}).(*auth.User)
	return u
}

func (s *Server) authRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/auth/status", s.authStatus)
	m.HandleFunc("POST /api/auth/setup", s.authSetup)
	m.HandleFunc("POST /api/auth/login", s.authLogin)
	m.HandleFunc("POST /api/auth/logout", s.authLogout)
	m.HandleFunc("POST /api/auth/password", s.authChangePassword)
	m.HandleFunc("GET /api/users", s.admin(s.listUsers))
	m.HandleFunc("POST /api/users", s.admin(s.createUser))
	m.HandleFunc("PATCH /api/users/{id}", s.admin(s.patchUser))
}

// signedIn resolves the session cookie to a user and their database.
func (s *Server) signedIn(r *http.Request) (*auth.User, *db.DB, error) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return nil, nil, auth.ErrNoSession
	}
	u, err := s.Auth.SessionUser(r.Context(), c.Value)
	if err != nil {
		return nil, nil, err
	}
	d, err := s.Auth.DBFor(r.Context(), u.ID)
	return u, d, err
}

// sameOrigin refuses state-changing requests sent from another site. The
// SameSite=Lax cookie already blocks most of these; this covers the rest.
func sameOrigin(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // same-origin fetches from older browsers, curl
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host == r.Host
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

// authStatus tells the web app which screen to show: setup, login, or the
// app for the signed-in user.
func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	need, err := s.Auth.NeedsSetup(r.Context())
	if err != nil {
		respond(w, nil, err)
		return
	}
	var user *auth.User
	if u, _, err := s.signedIn(r); err == nil {
		user = u
	}
	respond(w, map[string]any{"setup_needed": need, "user": user}, nil)
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) authSetup(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := decodeBody(r, &c); err != nil {
		respond(w, nil, err)
		return
	}
	if _, err := s.Auth.Setup(r.Context(), c.Username, c.Password); err != nil {
		if errors.Is(err, auth.ErrSetupDone) {
			writeError(w, http.StatusConflict, "conflict", err.Error())
			return
		}
		respond(w, nil, err)
		return
	}
	s.login(w, r, c)
}

func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := decodeBody(r, &c); err != nil {
		respond(w, nil, err)
		return
	}
	s.login(w, r, c)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request, c credentials) {
	u, token, err := s.Auth.Login(r.Context(), c.Username, c.Password, r.UserAgent())
	switch {
	case errors.Is(err, auth.ErrBadLogin):
		writeError(w, http.StatusUnauthorized, "unauthenticated", err.Error())
		return
	case errors.Is(err, auth.ErrLocked):
		writeError(w, http.StatusTooManyRequests, "locked", err.Error())
		return
	case err != nil:
		respond(w, nil, err)
		return
	}
	setSessionCookie(w, r, token, auth.SessionTTL)
	respond(w, map[string]any{"user": u}, nil)
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		s.Auth.Logout(r.Context(), c.Value)
	}
	setSessionCookie(w, r, "", -time.Second)
	respond(w, map[string]bool{"ok": true}, nil)
}

func (s *Server) authChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	c, _ := r.Cookie(cookieName)
	err := s.Auth.ChangePassword(r.Context(), userOf(r.Context()).ID, body.Current, body.New, c.Value)
	respond(w, map[string]bool{"ok": true}, err)
}

// ---------- admin: user management ----------

func (s *Server) admin(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u := userOf(r.Context()); u == nil || !u.IsAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "admins only")
			return
		}
		h(w, r)
	}
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.Auth.ListUsers(r.Context())
	respond(w, users, err)
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		credentials
		IsAdmin bool `json:"is_admin"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	u, err := s.Auth.CreateUser(r.Context(), body.Username, body.Password, body.IsAdmin)
	respond(w, u, err)
}

// patchUser: {"password": "...", "is_admin": bool, "disabled": bool}, any subset.
func (s *Server) patchUser(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body struct {
		Password *string `json:"password"`
		IsAdmin  *bool   `json:"is_admin"`
		Disabled *bool   `json:"disabled"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	ctx := r.Context()
	if _, err := s.Auth.GetUser(ctx, id); err != nil {
		respond(w, nil, err)
		return
	}
	if body.Password != nil {
		if err := s.Auth.SetPassword(ctx, id, *body.Password); err != nil {
			respond(w, nil, err)
			return
		}
	}
	if body.IsAdmin != nil {
		if err := s.Auth.SetAdmin(ctx, id, *body.IsAdmin); err != nil {
			respond(w, nil, adminErr(err))
			return
		}
	}
	if body.Disabled != nil {
		if err := s.Auth.SetDisabled(ctx, id, *body.Disabled); err != nil {
			respond(w, nil, adminErr(err))
			return
		}
	}
	u, err := s.Auth.GetUser(ctx, id)
	respond(w, u, err)
}

func adminErr(err error) error {
	if errors.Is(err, auth.ErrLastAdmin) {
		return &db.ConflictError{Msg: err.Error()}
	}
	return err
}
