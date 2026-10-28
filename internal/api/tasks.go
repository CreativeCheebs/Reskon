package api

import (
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) taskRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/tasks", s.listTasks)
	m.HandleFunc("POST /api/tasks", s.createTask)
	m.HandleFunc("GET /api/tasks/{id}", s.getTask)
	m.HandleFunc("PATCH /api/tasks/{id}", s.patchTask)
	m.HandleFunc("DELETE /api/tasks/{id}", s.deleteTask)
	m.HandleFunc("POST /api/tasks/{id}/move", s.moveTask)
	m.HandleFunc("GET /api/tasks/{id}/transitions", s.taskTransitions)
}

func (s *Server) moveTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var req db.MoveRequest
	if err := decodeBody(r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := s.DB.Move(r.Context(), id, req)
	respond(w, t, err)
}

func (s *Server) taskTransitions(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if _, err := s.DB.GetTask(r.Context(), id); err != nil {
		respond(w, nil, err)
		return
	}
	tr, err := s.DB.Transitions(r.Context(), id)
	respond(w, map[string]any{"transitions": tr}, err)
}

// listTasks resolves the view's filter server-side; the client sends only
// the view id. Without ?view= it returns every task.
func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	viewID, ok, err := queryID(r, "view")
	if err != nil {
		respond(w, nil, err)
		return
	}
	if ok {
		tasks, err := s.DB.ListTasksForView(r.Context(), viewID)
		respond(w, tasks, err)
		return
	}
	tasks, err := s.DB.ListTasks(r.Context())
	respond(w, tasks, err)
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	t, err := s.DB.CreateTask(r.Context(), f)
	respond(w, t, err)
}

func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	t, err := s.DB.GetTask(r.Context(), id)
	respond(w, t, err)
}

func (s *Server) patchTask(w http.ResponseWriter, r *http.Request) {
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
	t, err := s.DB.PatchTask(r.Context(), id, f)
	respond(w, t, err)
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, s.DB.DeleteTask(r.Context(), id))
}
