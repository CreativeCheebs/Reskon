// Command example-plugin runs the pretend habit tracker from
// internal/apps/appstest, so a test server can connect a real app.
// It is for testing only: its username and password are fixed
// (aakash / habits-123) and printed at start. -reskon is the Reskon
// address allowed to show its widget page in a frame.
//
//	example-plugin -addr :8098 -reskon http://192.168.0.8:8097
package main

import (
	"flag"
	"log"
	"net/http"
	"strings"
	"time"

	"jitterbug/internal/apps/appstest"
)

func main() {
	addr := flag.String("addr", ":8098", "address to listen on")
	reskon := flag.String("reskon", "http://localhost:8080", "Reskon's address (scheme, host and port), allowed to frame the widget page")
	flag.Parse()
	f := appstest.NewFake()
	f.ReskonOrigin = strings.TrimRight(*reskon, "/")
	log.Printf("example plugin %q on %s for Reskon at %s: sign in as %s / %s", "Habits", *addr, f.ReskonOrigin, f.User, f.Password)
	srv := &http.Server{Addr: *addr, Handler: f.Handler(), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
