package api

import (
	"net/http"
	"strings"

	"jitterbug/internal/db"
)

func (s *Server) captureRoutes() {
	s.mux.HandleFunc("POST /api/capture", s.capture)
}

// capture parses one line into the section 8 contract. It writes nothing.
func (s *Server) capture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" {
		respond(w, nil, &db.InvalidError{Msg: "text is required"})
		return
	}
	lookups, err := dbOf(r.Context()).CaptureLookups(r.Context(), text, 8)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, s.Capture.Parse(r.Context(), text, lookups), nil)
}
