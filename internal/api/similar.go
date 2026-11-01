package api

import (
	"net/http"
	"strconv"

	"jitterbug/internal/db"
)

func (s *Server) similarRoutes() {
	s.mux.HandleFunc("GET /api/tasks/similar", s.similarTasks)
	s.mux.HandleFunc("GET /api/semantic", s.semanticStatus)
	s.mux.HandleFunc("POST /api/semantic/download", s.admin(s.semanticDownload))
}

// similarTasks is duplicate search: ?q= the text being typed, optional
// ?exclude= a task id to leave out and ?limit= (default 6).
func (s *Server) similarTasks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 20 {
		limit = 6
	}
	exclude, _ := strconv.ParseInt(q.Get("exclude"), 10, 64)
	// A nil *Model must stay a nil interface, or search would call it.
	var m db.Embedder
	if model := s.Semantic.Model(); model != nil {
		m = model
	}
	res, err := dbOf(r.Context()).SimilarTasks(r.Context(), q.Get("q"), m, limit, exclude)
	respond(w, res, err)
}

func (s *Server) semanticStatus(w http.ResponseWriter, r *http.Request) {
	if s.Semantic == nil {
		respond(w, map[string]string{"state": "off"}, nil)
		return
	}
	respond(w, s.Semantic.Status(), nil)
}

// semanticDownload fetches the model once, for everyone on this server.
func (s *Server) semanticDownload(w http.ResponseWriter, r *http.Request) {
	if s.Semantic == nil {
		writeError(w, http.StatusConflict, "off", "semantic search is not available on this server")
		return
	}
	s.Semantic.StartDownload()
	respond(w, s.Semantic.Status(), nil)
}
