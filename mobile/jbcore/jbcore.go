// Package jbcore runs the Reskon API inside an Android app, in the app's
// own process. gomobile turns it into an .aar; Kotlin calls Start once, then
// Call for each request. No network, no port: Call hands the request straight
// to the same http.Handler the server uses.
//
// mobile/ is its own Go module (jitterbug/mobile), so gomobile's dependency
// stays out of the server's go.mod. Its path sits under jitterbug/, which is
// what lets it import jitterbug/internal/....
package jbcore

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing/fstest"
	"time"
	_ "time/tzdata" // Android's own zone files aren't where Go looks

	"jitterbug/internal/api"
	"jitterbug/internal/auth"
	"jitterbug/internal/capture"
	"jitterbug/internal/db"
)

var (
	mu      sync.Mutex
	handler http.Handler
	store   *auth.Store
	cookie  string
	user    credentials
	dataDir string
)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Start opens the data directory. tz is the phone's zone id: Go on Android
// otherwise runs on UTC. cookie is the sign-in kept from last time (see
// Cookie); when it is empty or has expired, Start signs in, creating the
// account on first run. Signing in checks a bcrypt hash, slow on purpose, so
// a launch with a kept cookie skips it.
func Start(dir, tz, username, password, saved string) error {
	t0 := time.Now()
	mu.Lock()
	defer mu.Unlock()
	if handler != nil {
		return nil
	}
	if loc, err := time.LoadLocation(tz); err == nil {
		time.Local = loc
	}
	var err error
	store, err = auth.Open(dir, filepath.Join(dir, "none.db"))
	if err != nil {
		return err
	}
	parser := &capture.Parser{Config: captureConfig, Provider: capture.OpenAI{Client: &http.Client{}}}
	handler = api.New(store, parser, fstest.MapFS{})
	user = credentials{username, password}
	dataDir = dir
	log.Printf("jbcore: open %v", time.Since(t0))
	cookie = saved
	if cookie != "" {
		if signedIn() {
			log.Printf("jbcore: ready (kept sign-in) %v", time.Since(t0))
			return nil
		}
	}
	err = signIn()
	log.Printf("jbcore: ready (signed in) %v", time.Since(t0))
	return err
}

// signedIn reports whether the current cookie still names a user.
func signedIn() bool {
	_, body, _ := serve(handler, cookie, "GET", "/api/auth/status", "")
	var st struct {
		User *struct{} `json:"user"`
	}
	return json.Unmarshal([]byte(body), &st) == nil && st.User != nil
}

// Stop closes every database. Start can be called again afterwards.
func Stop() {
	mu.Lock()
	defer mu.Unlock()
	if store != nil {
		_ = store.Close()
	}
	store, handler, cookie = nil, nil, ""
}

// Export writes a clean copy of the signed-in user's database into destDir,
// which must not hold a file of the same name, and returns its path. It uses
// VACUUM INTO, so writes still in the WAL are included, unlike a file copy.
func Export(destDir string) (string, error) {
	mu.Lock()
	defer mu.Unlock()
	if store == nil {
		return "", fmt.Errorf("not started")
	}
	written, err := auth.Backup(dataDir, destDir)
	if err != nil {
		return "", err
	}
	// The full path: a backup also has apps/<name>.db (the server's
	// connected apps), which must never be taken for the database.
	want := filepath.Join(destDir, strings.ToLower(user.Username)+".db")
	for _, f := range written {
		if filepath.Clean(f) == filepath.Clean(want) {
			return f, nil
		}
	}
	return "", fmt.Errorf("no database for %s", user.Username)
}

// Cookie is the current sign-in, for the app to keep and pass to Start.
func Cookie() string {
	mu.Lock()
	defer mu.Unlock()
	return cookie
}

func signIn() error {
	var st struct {
		SetupNeeded bool `json:"setup_needed"`
	}
	code, body, _ := serve(handler, cookie, "GET", "/api/auth/status", "")
	if code != 200 {
		return fmt.Errorf("auth status: %d %s", code, body)
	}
	_ = json.Unmarshal([]byte(body), &st)
	path := "/api/auth/login"
	if st.SetupNeeded {
		path = "/api/auth/setup"
	}
	b, _ := json.Marshal(user)
	code, body, set := serve(handler, cookie, "POST", path, string(b))
	if code != 200 {
		return fmt.Errorf("sign in: %d %s", code, body)
	}
	cookie = set
	return nil
}

// serve runs one request through handler with the given cookie. It touches
// no shared state, so it can run without holding mu.
func serve(h http.Handler, ck, method, path, body string) (int, string, string) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:1"
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if ck != "" {
		req.Header.Set("Cookie", ck)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	set := ""
	for _, c := range rec.Result().Cookies() {
		set = c.Name + "=" + c.Value
	}
	return rec.Code, rec.Body.String(), set
}

// Call runs one API request, e.g. Call("GET", "/api/tasks?view=1", "").
// It returns the JSON body, or an error carrying the status and body.
//
// mu is held only to read or change the shared state, never while a request
// runs: a quick-capture request can wait five seconds for the language model,
// and every other screen must still be answered meanwhile.
func Call(method, path, body string) (string, error) {
	h, ck := current()
	if h == nil {
		return "", fmt.Errorf("not started")
	}
	code, out, _ := serve(h, ck, method, path, body)
	if code == http.StatusUnauthorized {
		if err := refreshSignIn(h); err != nil {
			return "", err
		}
		h, ck = current()
		if h == nil {
			return "", fmt.Errorf("not started")
		}
		code, out, _ = serve(h, ck, method, path, body)
	}
	if code >= 400 {
		return "", fmt.Errorf("%d %s", code, out)
	}
	return out, nil
}

// current is the handler and sign-in to use for the next request.
func current() (http.Handler, string) {
	mu.Lock()
	defer mu.Unlock()
	return handler, cookie
}

// refreshSignIn signs in again after the server said 401, unless Stop and
// Start have replaced the handler the failed request used.
func refreshSignIn(failedWith http.Handler) error {
	mu.Lock()
	defer mu.Unlock()
	if handler == nil || handler != failedWith {
		return nil // another call already signed in again, or the core restarted
	}
	return signIn()
}

// captureConfig: the user's LLM settings, as on the server (no env fallback on a phone).
func captureConfig(ctx context.Context) capture.Config {
	d := db.FromContext(ctx)
	get := func(key string) string {
		var v string
		if d != nil {
			if ok, err := d.Setting(ctx, key, &v); ok && err == nil {
				return v
			}
		}
		return ""
	}
	return capture.Config{Endpoint: get("llm_endpoint"), Model: get("llm_model"), APIKey: get("llm_api_key")}
}
