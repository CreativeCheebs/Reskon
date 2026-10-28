package api

import "net/http"

func (s *Server) taskRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/tasks", s.listTasks)
	m.HandleFunc("POST /api/tasks", s.createTask)
	m.HandleFunc("GET /api/tasks/{id}", s.getTask)
	m.HandleFunc("PATCH /api/tasks/{id}", s.patchTask)
	m.HandleFunc("DELETE /api/tasks/{id}", s.deleteTask)
}

func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
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
