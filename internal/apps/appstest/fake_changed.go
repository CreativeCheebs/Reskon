package appstest

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

// The pretend plugin's side of "my data changed" (docs/plugins.md section
// 7). Reskon calls POST /api/reskon/connect with the token once, handing an
// address and a key; the fake keeps both in memory (a restart forgets them:
// check the app again in Reskon to hand a new key). A tick made through the
// test tick call (a change made "elsewhere", not in the page) then calls
// that address with the key. The page itself posts "changed" to Reskon's
// page instead (fake_page.go).

// ConnectPath is the fake's connect_url.
const ConnectPath = "/api/reskon/connect"

// Hook is what Reskon handed the fake at connect time.
type Hook struct{ ChangedURL, Key string }

// Hook returns what Reskon last handed over (tests use it).
func (f *Fake) Hook() Hook {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hook
}

// SetConnectFails makes the connect call answer 500 (a plugin that cannot
// take the key), or work again.
func (f *Fake) SetConnectFails(fail bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.connectFails = fail
}

func (f *Fake) changedRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST "+ConnectPath, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ChangedURL string `json:"changed_url"`
			Key        string `json:"key"`
		}
		ok := readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		if bearer(r) != f.Token {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not signed in"})
			return
		}
		if f.connectFails {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "secret detail that must not be shown"})
			return
		}
		u, err := url.Parse(body.ChangedURL)
		if !ok || err != nil || (u.Scheme != "http" && u.Scheme != "https") || body.Key == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "send changed_url and key"})
			return
		}
		f.hook = Hook{ChangedURL: body.ChangedURL, Key: body.Key}
		w.WriteHeader(http.StatusNoContent)
	})
}

// tellReskon calls Reskon's changed address, if it handed one, without
// holding up the tick. A failed call is dropped: Reskon's widgets also
// refresh when opened. Call with f.mu held.
func (f *Fake) tellReskon() {
	h := f.hook
	if h.ChangedURL == "" {
		return
	}
	f.calls.Add(1)
	go func() {
		defer f.calls.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.ChangedURL, nil)
		if err != nil {
			return
		}
		req.Header.Set("Authorization", "Bearer "+h.Key)
		if res, err := http.DefaultClient.Do(req); err == nil {
			res.Body.Close()
		}
	}()
}
