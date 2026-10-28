// Command jitterbug serves the JitterBug API and the embedded web UI from a
// single binary backed by one SQLite file.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"jitterbug/internal/api"
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
	dbPath := env("JITTERBUG_DB", "jitterbug.db")
	addr := env("JITTERBUG_ADDR", ":8080")

	d, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open %s: %v", dbPath, err)
	}
	defer d.Close()

	// `jitterbug backup <file>` writes a consistent copy and exits. Works
	// while another jitterbug process is serving the same database.
	if len(os.Args) == 3 && os.Args[1] == "backup" {
		if err := d.Backup(context.Background(), os.Args[2]); err != nil {
			log.Fatalf("backup: %v", err)
		}
		log.Printf("backed up %s to %s", dbPath, os.Args[2])
		return
	}

	parser := &capture.Parser{Config: captureConfig(d), Provider: capture.OpenAI{Client: &http.Client{}}}
	srv := api.New(d, parser, web.Dist())
	log.Printf("jitterbug: database %s, listening on %s", dbPath, addr)
	log.Fatal(http.ListenAndServe(addr, srv))
}

// captureConfig reads the LLM provider settings on every capture, so a
// change in Settings applies at once. The setting wins; the environment
// variable is the fallback. Neither is needed to start.
func captureConfig(d *db.DB) func(ctx context.Context) capture.Config {
	return func(ctx context.Context) capture.Config {
		get := func(key, envName string) string {
			var v string
			if ok, err := d.Setting(ctx, key, &v); ok && err == nil && v != "" {
				return v
			}
			return os.Getenv(envName)
		}
		return capture.Config{
			Endpoint: get("llm_endpoint", "JITTERBUG_LLM_ENDPOINT"),
			Model:    get("llm_model", "JITTERBUG_LLM_MODEL"),
			APIKey:   get("llm_api_key", "JITTERBUG_LLM_API_KEY"),
		}
	}
}
