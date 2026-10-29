package api

import (
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) sessionRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/sessions", s.listSessions)
	m.HandleFunc("POST /api/sessions", s.createSession)
	m.HandleFunc("PATCH /api/sessions/{id}", s.patchSession)
	m.HandleFunc("DELETE /api/sessions/{id}", s.deleteSession)
	m.HandleFunc("GET /api/day/{date}", s.getDay)
}

// listSessions accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD&task_id=N.
func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	q := db.SessionQuery{From: r.URL.Query().Get("from"), To: r.URL.Query().Get("to")}
	if id, ok, err := queryID(r, "task_id"); err != nil {
		respond(w, nil, err)
		return
	} else if ok {
		q.TaskID = id
	}
	sessions, err := dbOf(r.Context()).ListSessions(r.Context(), q)
	respond(w, sessions, err)
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).CreateSession(r.Context(), f)
	respond(w, v, err)
}

func (s *Server) patchSession(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).PatchSession(r.Context(), id, f)
	respond(w, v, err)
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DeleteSession(r.Context(), id))
}

func (s *Server) getDay(w http.ResponseWriter, r *http.Request) {
	v, err := dbOf(r.Context()).GetDay(r.Context(), r.PathValue("date"))
	respond(w, v, err)
}
