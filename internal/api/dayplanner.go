package api

import (
	"net/http"
)

// The Day Planner's routes (see internal/db/dayitems.go). Handlers only
// decode and call; the rules live in package db.

func (s *Server) dayPlannerRoutes() {
	m := s.mux
	m.HandleFunc("POST /api/day/{date}/items", s.addDayItem)
	m.HandleFunc("PUT /api/day/{date}/order", s.orderDay)
	m.HandleFunc("GET /api/day/{date}/bring-forward", s.bringForwardCandidates)
	m.HandleFunc("POST /api/day/{date}/bring-forward", s.bringForward)
	m.HandleFunc("PATCH /api/day-items/{id}", s.patchDayItem)
	m.HandleFunc("DELETE /api/day-items/{id}", s.deleteDayItem)
}

func (s *Server) addDayItem(w http.ResponseWriter, r *http.Request) {
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).AddDayItem(r.Context(), r.PathValue("date"), f)
	respond(w, v, err)
}

func (s *Server) patchDayItem(w http.ResponseWriter, r *http.Request) {
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
	v, err := dbOf(r.Context()).PatchDayItem(r.Context(), id, f)
	respond(w, v, err)
}

func (s *Server) deleteDayItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DeleteDayItem(r.Context(), id))
}

// orderDay: {"ids": [item ids, first to last]}. Returns the day.
func (s *Server) orderDay(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).OrderDay(r.Context(), r.PathValue("date"), body.IDs)
	respond(w, v, err)
}

func (s *Server) bringForwardCandidates(w http.ResponseWriter, r *http.Request) {
	v, err := dbOf(r.Context()).BringForwardCandidates(r.Context(), r.PathValue("date"))
	respond(w, v, err)
}

// bringForward: {"task_ids": [...]}. Returns the day.
func (s *Server) bringForward(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TaskIDs []int64 `json:"task_ids"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).BringForward(r.Context(), r.PathValue("date"), body.TaskIDs)
	respond(w, v, err)
}
