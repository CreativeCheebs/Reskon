package api

import (
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) sessionRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/sessions", s.listSessions)
	m.HandleFunc("POST /api/sessions", s.createSession)
	m.HandleFunc("POST /api/sessions/bulk", s.bulkSessions)
	m.HandleFunc("PATCH /api/sessions/{id}", s.patchSession)
	m.HandleFunc("DELETE /api/sessions/{id}", s.deleteSession)
	m.HandleFunc("GET /api/day/{date}", s.getDay)
}

// listSessions accepts ?from=&to= (YYYY-MM-DD), task_id, energy_type and
// area (comma-separated ids), kind (task|event), q, and has_task,
// has_difficulty, has_subtypes (true|false).
func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	q := db.SessionQuery{From: v.Get("from"), To: v.Get("to"), Kind: v.Get("kind"), Search: v.Get("q")}
	var err error
	if id, ok, e := queryID(r, "task_id"); e != nil {
		err = e
	} else if ok {
		q.TaskID = id
	}
	if err == nil {
		q.EnergyTypes, err = idList(v.Get("energy_type"))
	}
	if err == nil {
		q.Areas, err = idList(v.Get("area"))
	}
	q.HasTask = optBool(v.Get("has_task"))
	q.HasDiff = optBool(v.Get("has_difficulty"))
	q.HasSubtypes = optBool(v.Get("has_subtypes"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	sessions, err := dbOf(r.Context()).ListSessions(r.Context(), q)
	respond(w, sessions, err)
}

// bulkSessions: {"ids": [...], "set": {field: value, ...}} or
// {"ids": [...], "delete": true}. All or nothing.
func (s *Server) bulkSessions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs    []int64   `json:"ids"`
		Set    db.Fields `json:"set"`
		Delete bool      `json:"delete"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	n, err := dbOf(r.Context()).BulkSessions(r.Context(), body.IDs, body.Set, body.Delete)
	respond(w, map[string]int{"changed": n}, err)
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

// optBool reads "true"/"false"; anything else means no constraint.
func optBool(v string) *bool {
	switch v {
	case "true":
		t := true
		return &t
	case "false":
		f := false
		return &f
	}
	return nil
}
