package api

import "net/http"

// Tags (see internal/db/tags.go). A task or session gets its tags through its own
// `tags` field (a list of names); these routes manage the list itself.
func (s *Server) tagRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/tags", s.listTags)
	m.HandleFunc("POST /api/tags", s.createTag)
	m.HandleFunc("PATCH /api/tags/{id}", s.renameTag)
	m.HandleFunc("DELETE /api/tags/{id}", s.deleteTag)
}

func (s *Server) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := dbOf(r.Context()).ListTags(r.Context())
	respond(w, tags, err)
}

func (s *Server) createTag(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).CreateTag(r.Context(), body.Name)
	respond(w, t, err)
}

func (s *Server) renameTag(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).RenameTag(r.Context(), id, body.Name)
	respond(w, t, err)
}

func (s *Server) deleteTag(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DeleteTag(r.Context(), id))
}
