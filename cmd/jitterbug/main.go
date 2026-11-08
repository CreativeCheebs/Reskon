// Command jitterbug serves the Reskon API and the embedded web UI from a
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
	"strings"
	"time"

	"jitterbug/internal/api"
	"jitterbug/internal/auth"
	"jitterbug/internal/capture"
	"jitterbug/internal/db"
	"jitterbug/internal/embed"
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

	// `jitterbug backup <dir>` writes a consistent copy of auth.db and every
	// user's database into dir, then exits. Safe while a server is running.
	// It runs before the store opens (opening migrates) and reads every file
	// read-only, so a backup is always the data exactly as it was.
	if len(os.Args) == 3 && os.Args[1] == "backup" {
		written, err := auth.Backup(dataDir, os.Args[2])
		for _, w := range written {
			log.Printf("backed up %s", w)
		}
		if err != nil {
			log.Fatalf("backup: %v", err)
		}
		return
	}

	store, err := auth.Open(dataDir, legacyDB)
	if err != nil {
		log.Fatalf("open data directory %s: %v", dataDir, err)
	}
	defer func() { _ = store.Close() }()

	// `jitterbug import-jira <export.db> <username> [--dry-run] [--area label=Name ...]`
	// loads a Jira export into that person's data. --dry-run does
	// everything, reports, and rolls back. --area puts issues with a Jira
	// label into an existing area, e.g. --area MainJob="Day Job".
	if len(os.Args) >= 4 && os.Args[1] == "import-jira" {
		dry := false
		areas := map[string]string{}
		for i := 4; i < len(os.Args); i++ {
			switch a := os.Args[i]; {
			case a == "--dry-run":
				dry = true
			case a == "--area" && i+1 < len(os.Args):
				i++
				label, name, ok := strings.Cut(os.Args[i], "=")
				if !ok {
					log.Fatalf("import-jira: --area wants label=Area name, got %q", os.Args[i])
				}
				areas[label] = name
			default:
				log.Fatalf("import-jira: unknown argument %q", a)
			}
		}
		if err := importJira(store, os.Args[2], os.Args[3], dry, areas); err != nil {
			log.Fatalf("import-jira: %v", err)
		}
		return
	}

	parser := &capture.Parser{Config: captureConfig, Provider: capture.OpenAI{Client: &http.Client{}}}
	srv := api.New(store, parser, web.Dist())
	// Duplicate search's model lives beside the data, so the container
	// keeps it on its volume. JITTERBUG_EMBED_DIR points elsewhere.
	srv.Semantic = embed.NewService(env("JITTERBUG_EMBED_DIR", filepath.Join(dataDir, "models", embed.ModelName)))
	srv.SetupToken = os.Getenv("JITTERBUG_SETUP_TOKEN")
	srv.TrustProxy = os.Getenv("JITTERBUG_BEHIND_PROXY") == "1"
	srv.SecureCookie = os.Getenv("JITTERBUG_SECURE_COOKIE") == "1"
	if need, err := store.NeedsSetup(context.Background()); err == nil && need && srv.SetupToken == "" {
		log.Printf("jitterbug: no account exists yet, and anyone who can reach %s can create the first one. Set JITTERBUG_SETUP_TOKEN to require a secret.", addr)
	}
	go purgeSessions(store)
	log.Printf("jitterbug: data %s, listening on %s", dataDir, addr)
	// Slow clients may not hold a connection open forever. There is no read
	// or write timeout: a phone's first sync sends and receives many MB.
	server := &http.Server{
		Addr:              addr,
		Handler:           srv,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	log.Fatal(server.ListenAndServe())
}

// purgeSessions deletes expired login sessions once an hour.
func purgeSessions(store *auth.Store) {
	for {
		if n, err := store.PurgeExpiredSessions(context.Background(), time.Now()); err != nil {
			log.Printf("purge sessions: %v", err)
		} else if n > 0 {
			log.Printf("purged %d expired login sessions", n)
		}
		time.Sleep(time.Hour)
	}
}

func importJira(store *auth.Store, path, username string, dry bool, areas map[string]string) error {
	ctx := context.Background()
	users, err := store.ListUsers(ctx)
	if err != nil {
		return err
	}
	for _, u := range users {
		if u.Username != username {
			continue
		}
		d, err := store.DBFor(ctx, u.ID)
		if err != nil {
			return err
		}
		rep, err := d.ImportJira(ctx, path, dry, areas)
		if err != nil {
			return err
		}
		verb := "Imported"
		if dry {
			verb = "Dry run (nothing written) would import"
		}
		fmt.Printf("%s into %s:\n  %d tasks (%d epics, %d tasks in epics)\n  %d status transitions\n  %d sessions, %.1f h\n  %d comments (appended to descriptions), %d links (Jira links field)\n",
			verb, username, rep.Tasks, rep.Epics, rep.InEpics, rep.Transitions, rep.Sessions, rep.SessionH, rep.Comments, rep.Links)
		if len(rep.Created) > 0 {
			fmt.Println("Created:")
			for _, c := range rep.Created {
				fmt.Println("  - " + c)
			}
		}
		if len(rep.Warnings) > 0 {
			fmt.Println("Notes:")
			for _, w := range rep.Warnings {
				fmt.Println("  - " + w)
			}
		}
		return nil
	}
	return fmt.Errorf("no user %q (create the account first)", username)
}

// captureConfig reads the signed-in user's LLM settings on every capture,
// so a change in Settings applies at once. The setting wins; the
// environment variable is the server-wide fallback. Neither is needed to
// start.
func captureConfig(ctx context.Context) capture.Config {
	d := db.FromContext(ctx)
	setting := func(key string) string {
		var v string
		if d != nil {
			if ok, err := d.Setting(ctx, key, &v); ok && err == nil {
				return v
			}
		}
		return ""
	}
	return mergeCaptureConfig(setting, os.Getenv)
}

// mergeCaptureConfig combines one user's settings with the server's
// environment. The server-wide API key only goes with the server's own
// endpoint: if a user points capture at a different address, they must bring
// their own key, or any signed-in user could send the operator's key to a
// host of their choosing.
func mergeCaptureConfig(setting, env func(string) string) capture.Config {
	pick := func(key, envName string) string {
		if v := setting(key); v != "" {
			return v
		}
		return env(envName)
	}
	endpoint := pick("llm_endpoint", "JITTERBUG_LLM_ENDPOINT")
	key := setting("llm_api_key")
	if key == "" && sameEndpoint(endpoint, env("JITTERBUG_LLM_ENDPOINT")) {
		key = env("JITTERBUG_LLM_API_KEY")
	}
	return capture.Config{
		Endpoint: endpoint,
		Model:    pick("llm_model", "JITTERBUG_LLM_MODEL"),
		APIKey:   key,

		ReasoningEffort: env("JITTERBUG_LLM_REASONING_EFFORT"),
	}
}

// sameEndpoint compares two addresses ignoring a trailing slash.
func sameEndpoint(a, b string) bool {
	return strings.TrimRight(a, "/") == strings.TrimRight(b, "/")
}
