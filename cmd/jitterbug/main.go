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
	"strings"

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
	defer store.Close()

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
	log.Printf("jitterbug: data %s, listening on %s", dataDir, addr)
	log.Fatal(http.ListenAndServe(addr, srv))
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

		ReasoningEffort: os.Getenv("JITTERBUG_LLM_REASONING_EFFORT"),
	}
}
