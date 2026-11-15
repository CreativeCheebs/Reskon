package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"jitterbug/internal/auth"
	"jitterbug/internal/live"
)

// tabHeader names the browser tab that sent a request, so the note about
// its change is not sent back to the tab that already shows it.
const tabHeader = "X-Reskon-Tab"

// livePing is how often an open live connection is checked: a ping keeps
// it alive through routers, and the sign-in is checked again so a tab
// signed out elsewhere stops hearing about changes.
var livePing = 30 * time.Second

// noChange lists requests that use POST but do not change the person's data.
var noChange = map[string]bool{
	"/api/capture":           true, // capture only reads (it never writes)
	"/api/semantic/download": true, // a shared model file, not anyone's data
	"/api/sync/outgoing":     true, // only builds the request a device will send
	"/api/apps/preview":      true, // only reads an app's description
	"/api/apps/launch":       true, // only fetches a ticket for an app's page
}

// changeTopic says which part of a person's data a request changed, or ""
// when it changed nothing. Only successful writes count.
func changeTopic(r *http.Request, code int) string {
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return ""
	}
	if code >= 300 || noChange[r.URL.Path] || strings.HasPrefix(r.URL.Path, "/api/auth/") {
		return ""
	}
	topic, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	return topic
}

// statusRecorder remembers the reply's status code, so the change is only
// announced when it succeeded.
type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.code == 0 {
		s.code = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.code == 0 {
		s.code = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// tabID reads the sending tab's name, kept short and plain so it is safe to
// send back out.
func tabID(r *http.Request) string {
	v := r.Header.Get(tabHeader)
	if len(v) > 64 {
		return ""
	}
	for _, c := range v {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return ""
		}
	}
	return v
}

// liveSocket is GET /api/live: a WebSocket that receives a short note each
// time the signed-in person's data changes. Nothing is read from it.
func (s *Server) liveSocket(w http.ResponseWriter, r *http.Request) {
	u := userOf(r.Context())
	events, stop, ok := s.Live.Subscribe(u.ID)
	defer stop()
	if !ok {
		writeError(w, http.StatusTooManyRequests, "too many tabs", "close some Reskon tabs and try again")
		return
	}
	// Accept refuses a page from another site (its Origin must match the
	// host), so another site cannot listen with this person's cookie.
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		return // Accept has already answered
	}
	defer c.CloseNow()
	ctx := c.CloseRead(r.Context())
	tick := time.NewTicker(livePing)
	defer tick.Stop()
	send := func(f func(context.Context) error) bool {
		wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		return f(wctx) == nil
	}
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-events:
			if !send(func(ctx context.Context) error { return wsjson.Write(ctx, c, e) }) {
				return
			}
		case <-tick.C:
			// Signed out, password changed elsewhere, or account disabled:
			// stop. Any other error (a busy database) waits for the next tick.
			if err := s.stillSignedIn(r); errors.Is(err, auth.ErrNoSession) {
				c.Close(websocket.StatusPolicyViolation, "signed out")
				return
			}
			if !send(c.Ping) {
				return
			}
		}
	}
}

// stillSignedIn checks the request's sign-in again without extending it.
func (s *Server) stillSignedIn(r *http.Request) error {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return auth.ErrNoSession
	}
	_, err = s.Auth.SessionAlive(r.Context(), c.Value)
	return err
}

type unchangedKey struct{}

// withUnchanged gives the request a flag a handler can set to say that, this
// time, it changed nothing (a phone sync that only fetched).
func withUnchanged(r *http.Request) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), unchangedKey{}, new(bool)))
}

// markUnchanged says this request changed nothing, so no note is sent.
func markUnchanged(r *http.Request) {
	if f, ok := r.Context().Value(unchangedKey{}).(*bool); ok {
		*f = true
	}
}

// announce tells the person's other tabs that a request changed their data.
func (s *Server) announce(r *http.Request, code int) {
	u := userOf(r.Context())
	if u == nil {
		return
	}
	if f, ok := r.Context().Value(unchangedKey{}).(*bool); ok && *f {
		return
	}
	if topic := changeTopic(r, code); topic != "" {
		s.Live.Publish(u.ID, live.Event{Topic: topic, Tab: tabID(r)})
	}
}
