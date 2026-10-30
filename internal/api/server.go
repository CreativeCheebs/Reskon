// Package api is the JSON-over-HTTP layer. Handlers decode, call one db
// method, and encode. Rules live in package db, not here.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"

	"jitterbug/internal/auth"
	"jitterbug/internal/capture"
	"jitterbug/internal/db"
)

// Server holds what handlers need. Each request works on the signed-in
// user's own database, which the auth middleware puts on the context.
type Server struct {
	Auth    *auth.Store
	Capture *capture.Parser
	mux     *http.ServeMux
}

// New wires every route. web is the built frontend (may be nil in tests).
func New(a *auth.Store, p *capture.Parser, web fs.FS) *Server {
	s := &Server{Auth: a, Capture: p, mux: http.NewServeMux()}
	s.routes()
	// Unknown API paths are a JSON 404, never the SPA's index.html.
	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not found", r.Method+" "+r.URL.Path)
	})
	if web != nil {
		s.mux.Handle("/", spa(web))
	}
	return s
}

// ServeHTTP checks the request's origin and sign-in before routing. Only
// /api/health and the sign-in endpoints are reachable signed out; the web
// app itself is public so it can show the login page.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "forbidden", "cross-origin request refused")
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") && !publicPaths[r.URL.Path] {
		u, d, err := s.signedIn(r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "sign in first")
			return
		}
		ctx := db.WithDB(context.WithValue(r.Context(), userKey{}, u), d)
		r = r.WithContext(ctx)
	}
	if strings.HasPrefix(r.URL.Path, "/api/") && acceptsGzip(r) {
		g := &gzipJSON{ResponseWriter: w}
		defer g.close()
		w = g
	}
	s.mux.ServeHTTP(w, r)
}

// dbOf is the signed-in user's database for this request.
func dbOf(ctx context.Context) *db.DB { return db.FromContext(ctx) }

func (s *Server) routes() {
	m := s.mux
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	s.authRoutes()
	m.HandleFunc("GET /api/bootstrap", s.bootstrap)
	m.HandleFunc("PUT /api/settings/{key}", s.putSetting)

	s.taskRoutes()
	s.lookupRoutes()
	s.sessionRoutes()
	s.captureRoutes()
	s.stateRoutes()
	s.imageRoutes()
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	b, err := dbOf(r.Context()).Bootstrap(r.Context())
	respond(w, b, err)
}

func (s *Server) putSetting(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad body", err.Error())
		return
	}
	err = dbOf(r.Context()).PutSetting(r.Context(), r.PathValue("key"), body)
	respond(w, map[string]bool{"ok": true}, err)
}

// ---------- helpers ----------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// writeError sends the spec's error shape: {error, detail}.
func writeError(w http.ResponseWriter, code int, msg, detail string) {
	writeJSON(w, code, map[string]string{"error": msg, "detail": detail})
}

// respond writes v as 200, or maps err to the right status code.
func respond(w http.ResponseWriter, v any, err error) {
	if err == nil {
		writeJSON(w, http.StatusOK, v)
		return
	}
	var inv *db.InvalidError
	var conf *db.ConflictError
	switch {
	case errors.Is(err, db.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found", "")
	case errors.As(err, &inv):
		writeError(w, http.StatusBadRequest, "invalid", inv.Msg)
	case errors.As(err, &conf):
		// 409 carries the current row when there is one.
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "conflict", "detail": conf.Msg, "current": conf.Current,
		})
	default:
		log.Printf("error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error", err.Error())
	}
}

// decodeFields reads a JSON object body as db.Fields.
func decodeFields(r *http.Request) (db.Fields, error) {
	var f db.Fields
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&f); err != nil {
		return nil, &db.InvalidError{Msg: "body must be a JSON object"}
	}
	if f == nil {
		f = db.Fields{}
	}
	return f, nil
}

func decodeBody(r *http.Request, dst any) error {
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(dst); err != nil {
		return &db.InvalidError{Msg: "bad JSON body: " + err.Error()}
	}
	return nil
}

// pathID reads the {id} path segment.
func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return 0, &db.InvalidError{Msg: "id must be an integer"}
	}
	return id, nil
}

// idList reads "1,2,3" (empty means none).
func idList(v string) ([]int64, error) {
	var out []int64
	for _, part := range strings.Split(v, ",") {
		if part = strings.TrimSpace(part); part == "" {
			continue
		}
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil {
			return nil, &db.InvalidError{Msg: "ids must be integers separated by commas"}
		}
		out = append(out, id)
	}
	return out, nil
}

// queryID reads an optional integer query parameter.
func queryID(r *http.Request, name string) (int64, bool, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return 0, false, nil
	}
	id, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, false, &db.InvalidError{Msg: name + " must be an integer"}
	}
	return id, true, nil
}
