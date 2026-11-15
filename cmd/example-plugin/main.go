// Command example-plugin runs the pretend habit tracker from
// internal/apps/appstest, so a test server can connect a real app.
// It is for testing only: its username and password are fixed
// (aakash / habits-123) and printed at start.
//
//	example-plugin -addr :8098
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"jitterbug/internal/apps/appstest"
)

func main() {
	addr := flag.String("addr", ":8098", "address to listen on")
	flag.Parse()
	f := appstest.NewFake()
	log.Printf("example plugin %q on %s: sign in as %s / %s", "Habits", *addr, f.User, f.Password)
	srv := &http.Server{Addr: *addr, Handler: f.Handler(), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
