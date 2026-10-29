// Command jitterbug serves the JitterBug API and the embedded web UI from a
// single binary. Accounts live in <data>/auth.db; each user's data lives in
// its own SQLite file under <data>/users/.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"jitterbug/internal/api"
	"jitterbug/internal/auth"
	"jitterbug/internal/capture"
	"jitterbug/internal/db"
	"jitterbug/web"
)

// env returns the environment variable name, or def when it is unset.
func env(name, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func main() {
	dataDir := env("JITTERBUG_DATA", "data")
	// A single-user database from before accounts existed. If it is there
	// when the first admin is created, it becomes the admin's data.
	legacyDB := env("JITTERBUG_DB", "jitterbug.db")
	addr := env("JITTERBUG_ADDR", ":8080")

	store, err := auth.Open(dataDir, legacyDB)
	if err != nil {
		log.Fatalf("open data directory %s: %v", dataDir, err)
	}
	defer store.Close()

	// `jitterbug backup <dir>` writes a consistent copy of auth.db and every
	// user's database into dir, then exits. Safe while a server is running.
	if len(os.Args) == 3 && os.Args[1] == "backup" {
		if err := backup(store, os.Args[2]); err != nil {
			log.Fatalf("backup: %v", err)
		}
		return
	}

	parser := &capture.Parser{Config: captureConfig, Provider: capture.OpenAI{Client: &http.Client{}}}
	srv := api.New(store, parser, web.Dist())
	log.Printf("jitterbug: data %s, listening on %s", dataDir, addr)
	log.Fatal(http.ListenAndServe(addr, srv))
}

func backup(store *auth.Store, dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	files, err := store.DataFiles(context.Background())
	if err != nil {
		return err
	}
	for name, d := range files {
		dest := filepath.Join(dir, name)
		if _, err := os.Stat(dest); err == nil {
			return fmt.Errorf("%s already exists", dest)
		}
		if _, err := d.Exec(`VACUUM INTO ?`, dest); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		log.Printf("backed up %s", dest)
	}
	return nil
}

// captureConfig reads the signed-in user's LLM settings on every capture,
// so a change in Settings applies at once. The setting wins; the
// environment variable is the server-wide fallback. Neither is needed to
// start.
func captureConfig(ctx context.Context) capture.Config {
	d := db.FromContext(ctx)
	get := func(key, envName string) string {
		var v string
		if d != nil {
			if ok, err := d.Setting(ctx, key, &v); ok && err == nil && v != "" {
				return v
			}
		}
		return os.Getenv(envName)
	}
	return capture.Config{
		Endpoint: get("llm_endpoint", "JITTERBUG_LLM_ENDPOINT"),
		Model:    get("llm_model", "JITTERBUG_LLM_MODEL"),
		APIKey:   get("llm_api_key", "JITTERBUG_LLM_API_KEY"),
	}
}
