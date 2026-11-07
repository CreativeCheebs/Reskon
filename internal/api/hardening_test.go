package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jitterbug/internal/auth"
)

func TestInternalErrorsDoNotLeakDetails(t *testing.T) {
	rec := httptest.NewRecorder()
	respond(rec, nil, errors.New(`SELECT secret FROM user: no such table at /data/users/alice-ab12.db`))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "SELECT") || strings.Contains(rec.Body.String(), "/data/") {
		t.Fatalf("internal detail reached the client: %s", rec.Body.String())
	}
}

func serverWith(t *testing.T, tweak func(*Server)) *httptest.Server {
	t.Helper()
	store, err := auth.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	s := New(store, nil, nil)
	tweak(s)
	srv := httptest.NewServer(s)
	t.Cleanup(srv.Close)
	return srv
}

// With JITTERBUG_SETUP_TOKEN set, only someone who knows it can create the
// first account on a fresh server.
func TestSetupNeedsTheTokenWhenOneIsSet(t *testing.T) {
	srv := serverWith(t, func(s *Server) { s.SetupToken = "open-sesame" })
	c := newClient(t, srv)

	var st struct {
		SetupNeeded        bool `json:"setup_needed"`
		SetupTokenRequired bool `json:"setup_token_required"`
	}
	c.do("GET", "/api/auth/status", nil, &st)
	if !st.SetupNeeded || !st.SetupTokenRequired {
		t.Fatalf("status = %+v", st)
	}
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password"}, nil); code != 403 {
		t.Errorf("setup without the token = %d, want 403", code)
	}
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password", "setup_token": "wrong"}, nil); code != 403 {
		t.Errorf("setup with a wrong token = %d, want 403", code)
	}
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password", "setup_token": "open-sesame"}, nil); code != 200 {
		t.Errorf("setup with the token = %d, want 200", code)
	}
}

func TestSetupNeedsNoTokenByDefault(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	var st struct {
		SetupTokenRequired bool `json:"setup_token_required"`
	}
	c.do("GET", "/api/auth/status", nil, &st)
	if st.SetupTokenRequired {
		t.Error("a token is required although none is configured")
	}
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password"}, nil); code != 200 {
		t.Errorf("setup = %d, want 200", code)
	}
}

func TestSessionCookieCanBeForcedSecure(t *testing.T) {
	srv := serverWith(t, func(s *Server) { s.SecureCookie = true })
	c := newClient(t, srv)
	req, _ := http.NewRequest("POST", srv.URL+"/api/auth/setup", strings.NewReader(`{"username":"alice","password":"a long password"}`))
	res, err := c.h.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	for _, ck := range res.Cookies() {
		if ck.Name == cookieName && !ck.Secure {
			t.Error("session cookie is not marked Secure although forced")
		}
	}
}

// A lockout is about the one who failed: someone else's wrong guesses for
// "alice" (from another address) don't lock Alice out.
func TestLockoutIsPerClientAddress(t *testing.T) {
	srv := newServer(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password"}, nil)
	alice.do("POST", "/api/auth/logout", nil, nil)

	// httptest's connections all come from 127.0.0.1, so the other address is
	// supplied the way a trusted proxy would, via X-Forwarded-For.
	srv2 := serverWith(t, func(s *Server) { s.TrustProxy = true })
	c := newClient(t, srv2)
	c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password"}, nil)
	c.do("POST", "/api/auth/logout", nil, nil)
	post := func(ip, pw string) int {
		req, _ := http.NewRequest("POST", srv2.URL+"/api/auth/login", strings.NewReader(`{"username":"alice","password":"`+pw+`"}`))
		req.Header.Set("X-Forwarded-For", ip)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	for i := 0; i < 5; i++ {
		post("203.0.113.9", "wrong")
	}
	if code := post("203.0.113.9", "a long password"); code != 429 {
		t.Errorf("the guessing address got %d, want 429", code)
	}
	if code := post("192.168.0.20", "a long password"); code != 200 {
		t.Errorf("alice from her own address got %d, want 200", code)
	}
}

// Behind a reverse proxy that has not been declared (JITTERBUG_BEHIND_PROXY
// unset) every request seems to come from the proxy's one address. The
// address-wide limit must then switch itself off, or anyone's wrong guesses
// would lock everyone out. The per-name limit still applies.
func TestUndeclaredProxyDoesNotLockEveryoneOut(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "a long password"}, nil)
	c.do("POST", "/api/auth/logout", nil, nil)
	post := func(user, pw string) int {
		req, _ := http.NewRequest("POST", srv.URL+"/api/auth/login", strings.NewReader(`{"username":"`+user+`","password":"`+pw+`"}`))
		req.Header.Set("X-Forwarded-For", "203.0.113.50") // a proxy is there, but not declared
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	for i := 0; i < 40; i++ { // far past the per-address limit, with many different names
		post("stranger"+string(rune('a'+i%26))+string(rune('a'+i/26)), "x")
	}
	if code := post("alice", "a long password"); code != 200 {
		t.Fatalf("alice was locked out by other people's guesses: %d", code)
	}
	for i := 0; i < 5; i++ {
		post("alice", "wrong")
	}
	if code := post("alice", "a long password"); code != 429 {
		t.Errorf("the per-name limit should still lock alice's name: %d", code)
	}
}
