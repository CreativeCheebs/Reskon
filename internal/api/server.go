// Package api is the JSON-over-HTTP layer. Handlers decode, call one db
// method, and encode. Rules live in package db, not here.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"

	"jitterbug/internal/db"
)

// Server holds what handlers need.
type Server struct {
	DB  *db.DB
	mux *http.ServeMux
}

// New wires every route. web is the built frontend (may be nil in tests).
func New(d *db.DB, web fs.FS) *Server {
	s := &Server{DB: d, mux: http.NewServeMux()}
	s.routes()
	if web != nil {
		s.mux.Handle("/", spa(web))
	}
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	m := s.mux
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	m.HandleFunc("GET /api/bootstrap", s.bootstrap)
	m.HandleFunc("PUT /api/settings/{key}", s.putSetting)

	s.taskRoutes()
	s.lookupRoutes()
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	b, err := s.DB.Bootstrap(r.Context())
	respond(w, b, err)
}

func (s *Server) putSetting(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad body", err.Error())
		return
	}
	err = s.DB.PutSetting(r.Context(), r.PathValue("key"), body)
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

// spa serves the embedded frontend, falling back to index.html for any path
// that is not a file, so client-side navigation survives a reload.
func spa(web fs.FS) http.Handler {
	files := http.FileServer(http.FS(web))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(web, p); err != nil {
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
}
