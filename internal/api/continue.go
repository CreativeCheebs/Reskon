package api

import (
	"net/http"

	"jitterbug/internal/db"
)

// Continue a task, and rounds of the same task (see internal/db/continue.go
// and rounds.go).
func (s *Server) continueRoutes() {
	m := s.mux
	m.HandleFunc("POST /api/tasks/{id}/continue", s.continueTask)
	m.HandleFunc("POST /api/tasks/{id}/next-round", s.nextRound)
	m.HandleFunc("POST /api/tasks/{id}/round-kind", s.roundKind)
}

// continueTask makes the task that comes after this one; returns it.
func (s *Server) continueTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body db.ContinueInput
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).ContinueTask(r.Context(), id, body)
	respond(w, t, err)
}

// nextRound makes the next round of this task; returns it.
func (s *Server) nextRound(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body db.RoundInput
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).NextRound(r.Context(), id, body)
	respond(w, t, err)
}

// roundKind: {"kind": "round" | "version"} for the whole series.
func (s *Server) roundKind(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body struct {
		Kind string `json:"kind"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).SetRoundKind(r.Context(), id, body.Kind)
	respond(w, t, err)
}
