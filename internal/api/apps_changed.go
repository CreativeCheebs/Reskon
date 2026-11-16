package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"jitterbug/internal/apps"
	"jitterbug/internal/auth"
	"jitterbug/internal/live"
)

// An app says "my data changed" (docs/plugins.md section 7), and Reskon's
// open tabs fetch that app's data widgets again. Two ways in:
//   - from Reskon's own page, after the app's page in a frame posted
//     "changed": POST /api/apps/{app}/changed, signed in as usual, so the
//     person's other tabs hear about it too;
//   - from the app's own server, for changes made elsewhere: POST
//     /api/apps/changed with the key Reskon gave the app at its connect_url.
//     No cookie; the key says whose app it is.
// Either way only a short note goes out, with the app's id and no data, and
// Reskon sends the app nothing back. Both ways share one limit per person
// per app (noteLimiter). Handing the key over is in apps_handkey.go.

// HookPath is the public address apps call (POST only, see isPublic).
const HookPath = "/api/apps/changed"

// noteEvery is how often one person's app may send a note. Calls in between
// are answered the same way and folded into one note at the end of the
// wait, so the last change of a burst is never lost.
var noteEvery = 2 * time.Second

// Misses (keys of the right shape that are no one's) allowed per address per
// minute before the look-ups stop, so junk keys cannot keep auth.db busy.
const (
	maxMisses  = 30
	missWindow = time.Minute
)

func (s *Server) appChangedRoutes() {
	s.mux.HandleFunc("POST /api/apps/{app}/changed", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		// Its own note below; not the general "apps" note, which would
		// reload everything in the other tabs.
		markUnchanged(r)
		a, err := st.GetByAppID(r.Context(), r.PathValue("app"))
		if err != nil {
			s.appRespond(w, nil, err)
			return
		}
		user, tab := userOf(r.Context()).ID, tabID(r)
		s.notes().note(user, a.AppID, "", func(late bool) {
			e := live.Event{Topic: live.TopicAppData, App: a.AppID, Tab: tab}
			if late {
				e.Tab = "" // folded with other calls: every tab fetches
			}
			s.Live.Publish(user, e)
		})
		w.WriteHeader(http.StatusNoContent)
	}))
	s.mux.HandleFunc("POST "+HookPath, s.appHook)
}

// appHook is POST /api/apps/changed from an app's server. Every call with a
// key answers 204, whether the key is known, unknown, malformed or waiting
// its turn, so the answer tells a guesser nothing. A browser on another site
// cannot use it: it cannot add the Authorization header without Reskon's
// permission (which is never given), and a cross-site POST carries an
// Origin that ServeHTTP refuses.
func (s *Server) appHook(w http.ResponseWriter, r *http.Request) {
	if !s.AppsEnabled {
		writeError(w, http.StatusNotFound, "not available", "")
		return
	}
	// The body means nothing; read a little of it and drop it.
	_, _ = io.Copy(io.Discard, http.MaxBytesReader(w, r.Body, 1024))
	scheme, key, _ := strings.Cut(r.Header.Get("Authorization"), " ")
	key = strings.TrimSpace(key)
	if !strings.EqualFold(scheme, "bearer") || key == "" {
		writeError(w, http.StatusUnauthorized, "no key", "send the key Reskon gave the app at its connect_url")
		return
	}
	if auth.ValidHookKey(key) {
		s.hookCall(r, auth.HookHash(key))
	}
	w.WriteHeader(http.StatusNoContent)
}

// hookCall looks the key up (unless a note for it is already waiting, or
// its address has missed too often) and sends the note.
func (s *Server) hookCall(r *http.Request, hash string) {
	l := s.notes()
	addr := s.clientIP(r)
	if addr == "" {
		addr, _, _ = net.SplitHostPort(r.RemoteAddr)
	}
	if l.waitingFor(hash) || l.tooManyMisses(addr) {
		return
	}
	user, app, ok := s.hookOwner(r.Context(), hash)
	if !ok {
		l.miss(addr)
		return
	}
	l.note(user, app, hash, func(bool) {
		s.Live.Publish(user, live.Event{Topic: live.TopicAppData, App: app})
	})
}

// hookOwner finds whose app a key belongs to, and checks that app is still
// connected: the key list (auth.db) and the apps (each person's apps file)
// are separate files, so the database cannot keep them in step by itself.
func (s *Server) hookOwner(ctx context.Context, hash string) (int64, string, bool) {
	user, app, err := s.Auth.AppHookOwner(ctx, hash)
	if err != nil {
		if !errors.Is(err, auth.ErrNoHook) {
			log.Printf("apps: looking up a changed key: %v", err)
		}
		return 0, "", false
	}
	st, err := s.Auth.AppsFor(ctx, user)
	if err != nil {
		log.Printf("apps: opening user %d's apps: %v", user, err)
		return 0, "", false
	}
	if _, err := st.GetByAppID(ctx, app); err != nil {
		return 0, "", false
	}
	return user, app, true
}

// noteLimiter lets each person's app send at most one note per noteEvery,
// whichever way it comes in. Keys and addresses are only remembered after
// a look-up, so random keys cannot fill memory.
type noteLimiter struct {
	mu     sync.Mutex
	apps   map[string]*limitState // "<user>/<app>"
	hashes map[string]*limitState // a found key's hash -> its app's state
	misses map[string]*missState  // address -> keys not found
}

type limitState struct {
	last    time.Time
	pending bool // a note is set for the end of the wait
}

type missState struct {
	n     int
	since time.Time
}

func (s *Server) notes() *noteLimiter {
	s.noteOnce.Do(func() {
		s.noteLim = &noteLimiter{apps: map[string]*limitState{}, hashes: map[string]*limitState{}, misses: map[string]*missState{}}
	})
	return s.noteLim
}

// waitingFor says a note for this key is already set: the call needs no work.
func (l *noteLimiter) waitingFor(hash string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	st := l.hashes[hash]
	return st != nil && st.pending
}

// note sends now if the wait is over, or sets one note for the end of it
// (late = true), or does nothing when one is set already.
func (l *noteLimiter) note(user int64, app, hash string, send func(late bool)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	k := fmt.Sprintf("%d/%s", user, app)
	st := l.apps[k]
	if st == nil {
		l.forgetOld(now)
		st = &limitState{}
		l.apps[k] = st
	}
	if hash != "" {
		l.hashes[hash] = st
	}
	if st.pending {
		return
	}
	if wait := noteEvery - now.Sub(st.last); wait > 0 {
		st.pending = true
		time.AfterFunc(wait, func() {
			l.mu.Lock()
			st.pending = false
			st.last = time.Now()
			l.mu.Unlock()
			send(true)
		})
		return
	}
	st.last = now
	send(false)
}

// forgetOld drops apps and keys that have been quiet a while, once there are
// many. Call with l.mu held.
func (l *noteLimiter) forgetOld(now time.Time) {
	if len(l.apps)+len(l.hashes) < 1000 {
		return
	}
	quiet := func(st *limitState) bool { return !st.pending && now.Sub(st.last) > time.Minute }
	for k, st := range l.apps {
		if quiet(st) {
			delete(l.apps, k)
		}
	}
	for h, st := range l.hashes {
		if quiet(st) {
			delete(l.hashes, h)
		}
	}
}

func (l *noteLimiter) tooManyMisses(addr string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	m := l.misses[addr]
	if m == nil {
		return false
	}
	if time.Since(m.since) > missWindow {
		delete(l.misses, addr)
		return false
	}
	return m.n >= maxMisses
}

func (l *noteLimiter) miss(addr string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.misses) >= 10000 {
		l.misses = map[string]*missState{} // a flood from many addresses: start again
	}
	m := l.misses[addr]
	if m == nil || time.Since(m.since) > missWindow {
		m = &missState{since: time.Now()}
		l.misses[addr] = m
	}
	m.n++
}
