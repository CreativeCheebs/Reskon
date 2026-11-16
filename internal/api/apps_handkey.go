package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"jitterbug/internal/apps"
	"jitterbug/internal/auth"
)

// Handing an app its "my data changed" key at its connect_url
// (docs/plugins.md section 7). Done on connect, and every time the person
// presses Check again or Sign in again, so either button cures an app that
// lost its key. A new key is handed over first and stored only once the app
// has taken it; a failed hand-over leaves the old key working.

// handLock is held for one person's app during a hand-over (and removal),
// so two at once cannot leave Reskon keeping a different key from the one
// the app kept.
func (s *Server) handLock(user int64, app string) *sync.Mutex {
	v, _ := s.handLocks.LoadOrStore(fmt.Sprintf("%d/%s", user, app), &sync.Mutex{})
	return v.(*sync.Mutex)
}

// handKey gives the app a fresh key, if its description has a connect_url,
// and records how that went. The app stays connected either way: without a
// key, Reskon just won't hear about changes made elsewhere, and Settings ›
// Apps says why. An app whose description has no connect_url loses any key.
// The key is never logged or sent back to the browser.
func (s *Server) handKey(r *http.Request, st *apps.Store, a *apps.App) *apps.App {
	// A browser tab closed meanwhile must not leave the hand-over half done.
	ctx := context.WithoutCancel(r.Context())
	user := userOf(ctx).ID
	mu := s.handLock(user, a.AppID)
	mu.Lock()
	defer mu.Unlock()
	state, detail := apps.ChangesNone, ""
	switch {
	case a.Manifest == nil || a.Manifest.ConnectURL == "":
		// Always, even if no key is on record: an old key must never come back.
		if err := s.Auth.DropAppHook(ctx, user, a.AppID); err != nil {
			log.Printf("apps: dropping %s's changed key: %v", a.AppID, err)
		}
	case a.Status != apps.StatusOK || !a.SignedIn:
		return a // tried again on the next check or sign-in
	default:
		state, detail = s.giveKey(ctx, r, user, a)
	}
	if err := st.SetChanges(ctx, a.ID, state, detail); err != nil {
		log.Printf("apps: saving %s's changed state: %v", a.AppID, err)
		return a
	}
	if b, err := st.Get(ctx, a.ID); err == nil {
		return b
	}
	return a
}

// giveKey hands a new key to the app, then stores it in place of the old
// one. It returns the state and a reason (why it failed, or a warning about
// the address), in Reskon's words and safe to show.
func (s *Server) giveKey(ctx context.Context, r *http.Request, user int64, a *apps.App) (state, detail string) {
	changed, warn := s.changedURL(r)
	if changed == "" {
		return apps.ChangesFailed, "Reskon could not tell its own address from this request"
	}
	key, err := auth.NewHookKey()
	if err != nil {
		log.Printf("apps: making %s's changed key: %v", a.AppID, err)
		return apps.ChangesFailed, "Reskon could not make a key for it"
	}
	if err := s.appClient().Hand(ctx, a, changed, key); err != nil {
		var inv *apps.Invalid
		var un *apps.Unreachable
		switch {
		case errors.As(err, &inv):
			return apps.ChangesFailed, inv.Msg
		case errors.As(err, &un):
			return apps.ChangesFailed, un.Msg
		default:
			return apps.ChangesFailed, "the call to its connect_url failed"
		}
	}
	if err := s.Auth.SetAppHook(ctx, user, a.AppID, key); err != nil {
		log.Printf("apps: saving %s's changed key: %v", a.AppID, err)
		return apps.ChangesFailed, "Reskon could not save the key the app took"
	}
	return apps.ChangesOK, warn
}

// changedURL is the address an app calls to say its data changed: Reskon's
// address as this person's browser reached it, which is the address the
// app's server is most likely to reach too. Only behind a declared proxy
// (JITTERBUG_BEHIND_PROXY=1) do X-Forwarded-Proto and X-Forwarded-Host
// count. warn says, in plain words, when the address may be wrong: the
// request looks proxied but no proxy was declared, or the browser was on
// HTTPS but the address is plain HTTP. Empty when the host is not a plain
// address.
func (s *Server) changedURL(r *http.Request) (addr, warn string) {
	scheme, host := "http", r.Host
	if r.TLS != nil {
		scheme = "https"
	}
	first := func(h string) string {
		v, _, _ := strings.Cut(r.Header.Get(h), ",")
		return strings.TrimSpace(v)
	}
	proxied := r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Forwarded-Proto") != "" || r.Header.Get("X-Forwarded-Host") != ""
	if s.TrustProxy {
		if p := strings.ToLower(first("X-Forwarded-Proto")); p == "http" || p == "https" {
			scheme = p
		}
		if h := first("X-Forwarded-Host"); h != "" {
			host = h
		}
	}
	u, err := url.Parse(scheme + "://" + host)
	if err != nil || host == "" || u.Host != host || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return "", ""
	}
	addr = scheme + "://" + host + HookPath
	switch {
	case proxied && !s.TrustProxy:
		warn = "Reskon seems to be behind a proxy, but JITTERBUG_BEHIND_PROXY=1 is not set, so the app was told to call " + addr + ", which it may not reach"
	case scheme == "http" && strings.HasPrefix(strings.ToLower(r.Header.Get("Origin")), "https://"):
		warn = "your browser reached Reskon over HTTPS, but the app was told to call " + addr + " (plain HTTP), which it may not reach"
	}
	return addr, warn
}
