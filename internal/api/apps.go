package api

import (
	"errors"
	"net/http"

	"jitterbug/internal/apps"
)

// Connected apps (plugins), Settings › Apps. Each person's apps are in their
// own file (auth.Store.AppsFor); the sign-in token never leaves the server.
// The phone's built-in server leaves AppsEnabled off: it makes no network
// calls of its own.

func (s *Server) appRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/apps", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		list, err := st.List(r.Context())
		s.appRespond(w, list, err)
	}))
	// Reads an app's description without connecting it.
	m.HandleFunc("POST /api/apps/preview", s.appsHandler(func(_ *apps.Store, w http.ResponseWriter, r *http.Request) {
		var body struct {
			Address string `json:"address"`
		}
		if err := decodeBody(r, &body); err != nil {
			respond(w, nil, err)
			return
		}
		base, man, err := apps.Preview(r.Context(), s.appClient(), body.Address)
		s.appRespond(w, map[string]any{"address": base, "manifest": man}, err)
	}))
	m.HandleFunc("POST /api/apps", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		var body struct {
			Address string `json:"address"`
			apps.Credentials
		}
		if err := decodeBody(r, &body); err != nil {
			respond(w, nil, err)
			return
		}
		a, err := st.Connect(r.Context(), s.appClient(), body.Address, body.Credentials)
		s.appRespond(w, a, err)
	}))
	m.HandleFunc("POST /api/apps/{id}/check", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		a, err := st.Check(r.Context(), s.appClient(), id)
		s.appRespond(w, a, err)
	}))
	m.HandleFunc("POST /api/apps/{id}/sign-in", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		var cr apps.Credentials
		if err := decodeBody(r, &cr); err != nil {
			respond(w, nil, err)
			return
		}
		a, err := st.SignIn(r.Context(), s.appClient(), id, cr)
		s.appRespond(w, a, err)
	}))
	m.HandleFunc("DELETE /api/apps/{id}", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		s.appRespond(w, map[string]bool{"ok": true}, st.Remove(r.Context(), id))
	}))
}

func (s *Server) appClient() *apps.Client {
	if s.AppClient != nil {
		return s.AppClient
	}
	return &apps.Client{}
}

// appsHandler opens the signed-in person's apps file for h, or says apps
// are not available (the phone).
func (s *Server) appsHandler(h func(*apps.Store, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.AppsEnabled {
			writeError(w, http.StatusNotFound, "not available", "connected apps are set up on the Reskon server, in the web app")
			return
		}
		st, err := s.Auth.AppsFor(r.Context(), userOf(r.Context()).ID)
		if err != nil {
			respond(w, nil, err)
			return
		}
		h(st, w, r)
	}
}

// appRespond maps the apps package's errors. Their messages are written for
// the person and never contain what an app answered, only its status.
func (s *Server) appRespond(w http.ResponseWriter, v any, err error) {
	var inv *apps.Invalid
	var un *apps.Unreachable
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, v)
	case errors.Is(err, apps.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found", "")
	case errors.As(err, &inv):
		writeError(w, http.StatusBadRequest, "invalid", inv.Msg)
	case errors.As(err, &un):
		writeError(w, http.StatusBadGateway, "app unreachable", un.Msg)
	default:
		respond(w, nil, err)
	}
}
