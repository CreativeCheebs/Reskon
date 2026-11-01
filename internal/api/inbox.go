package api

import "net/http"

func (s *Server) inboxRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/inbox", s.listInbox)
	m.HandleFunc("POST /api/inbox", s.addInbox)
	m.HandleFunc("POST /api/inbox/{id}/triage", s.triageInbox)
	m.HandleFunc("DELETE /api/inbox/{id}", s.discardInbox)
}

func (s *Server) listInbox(w http.ResponseWriter, r *http.Request) {
	items, err := dbOf(r.Context()).ListInbox(r.Context())
	respond(w, items, err)
}

func (s *Server) addInbox(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	it, err := dbOf(r.Context()).AddInbox(r.Context(), body.Text)
	respond(w, it, err)
}

// triageInbox marks a line dealt with, once the client has saved the task
// or session made from it.
func (s *Server) triageInbox(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).TriageInbox(r.Context(), id))
}

func (s *Server) discardInbox(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DiscardInbox(r.Context(), id))
}
