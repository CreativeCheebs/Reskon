// Command jitterbug serves the JitterBug API and the embedded web UI from a
// single binary backed by one SQLite file.
package main

import (
	"log"
	"net/http"
	"os"

	"jitterbug/internal/api"
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

	srv := api.New(d, web.Dist())
	log.Printf("jitterbug: database %s, listening on %s", dbPath, addr)
	log.Fatal(http.ListenAndServe(addr, srv))
}
