// Command jitterbug serves the JitterBug API and the embedded web UI from a
// single binary backed by one SQLite file.
package main

import (
	"log"
	"os"

	"jitterbug/internal/db"
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
	d, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open %s: %v", dbPath, err)
	}
	defer d.Close()
	log.Printf("database %s ready", dbPath)
}
