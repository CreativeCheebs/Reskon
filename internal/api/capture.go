package api

import (
	"net/http"
	"strings"

	"jitterbug/internal/capture"
	"jitterbug/internal/db"
)

func (s *Server) captureRoutes() {
	s.mux.HandleFunc("POST /api/capture", s.capture)
	s.mux.HandleFunc("GET /api/capture/config", s.captureConfig)
	s.mux.HandleFunc("GET /api/capture/suggest", s.captureSuggest)
}

// captureSuggest lists past lines and task titles that match ?q= (read only).
func (s *Server) captureSuggest(w http.ResponseWriter, r *http.Request) {
	list, err := dbOf(r.Context()).CaptureSuggest(r.Context(), r.URL.Query().Get("q"))
	respond(w, list, err)
}

// captureConfig says which endpoint and model capture actually uses, and
// whether each comes from this person's settings or the server's
// environment. The API key itself is never sent, only whether one is set.
func (s *Server) captureConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var cfg capture.Config
	if s.Capture != nil && s.Capture.Config != nil {
		cfg = s.Capture.Config(ctx)
	}
	d := dbOf(ctx)
	source := func(key, effective string) string {
		if effective == "" {
			return ""
		}
		var v string
		if ok, err := d.Setting(ctx, key, &v); ok && err == nil && v != "" {
			return "settings"
		}
		return "environment"
	}
	respond(w, map[string]any{
		"endpoint":        cfg.Endpoint,
		"endpoint_source": source("llm_endpoint", cfg.Endpoint),
		"model":           cfg.Model,
		"model_source":    source("llm_model", cfg.Model),
		"api_key_set":     cfg.APIKey != "",
		"api_key_source":  source("llm_api_key", cfg.APIKey),
	}, nil)
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
