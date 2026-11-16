package api

import (
	"context"
	"errors"
	"log"
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
		if err == nil {
			// A key left from an earlier connection of this app never comes back.
			if derr := s.Auth.DropAppHook(context.WithoutCancel(r.Context()), userOf(r.Context()).ID, a.AppID); derr != nil {
				log.Printf("apps: dropping %s's old changed key: %v", a.AppID, derr)
			}
			a = s.handKey(r, st, a)
		}
		s.appRespond(w, a, err)
	}))
	m.HandleFunc("POST /api/apps/{id}/check", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		a, err := st.Check(r.Context(), s.appClient(), id)
		// A fresh "changed" key every time, so Check again cures an app
		// that lost its key (owner, 2026-11-15).
		if err == nil {
			a = s.handKey(r, st, a)
		}
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
		if err == nil {
			a = s.handKey(r, st, a)
		}
		s.appRespond(w, a, err)
	}))
	m.HandleFunc("DELETE /api/apps/{id}", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		a, err := st.Get(r.Context(), id)
		if err == nil {
			// Not during a hand-over, which would store a key after this drop.
			user := userOf(r.Context()).ID
			mu := s.handLock(user, a.AppID)
			mu.Lock()
			err = st.Remove(r.Context(), id)
			// Its "changed" key goes with it, so the app's calls do nothing.
			if err == nil {
				if derr := s.Auth.DropAppHook(context.WithoutCancel(r.Context()), user, a.AppID); derr != nil {
					log.Printf("apps: dropping %s's changed key: %v", a.AppID, derr)
				}
			}
			mu.Unlock()
		}
		s.appRespond(w, map[string]bool{"ok": true}, err)
	}))
	s.appPageRoutes()
	s.appDataRoutes()
	s.appChangedRoutes()
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
		if userOf(r.Context()) == nil {
			// Never reached signed out (ServeHTTP refuses first); a guard all the same.
			writeError(w, http.StatusUnauthorized, "unauthenticated", "sign in first")
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
