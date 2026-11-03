package jbcore

import (
	"encoding/json"
	"testing"
)

// One run through what the app does: start on an empty folder (creating the
// account), read, write, then start again with the kept cookie.
func TestStartCallCookie(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop)
	if err := Start(dir, "Asia/Kolkata", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	if Cookie() == "" {
		t.Fatal("no cookie after first start")
	}
	out, err := Call("GET", "/api/bootstrap", "")
	if err != nil {
		t.Fatal(err)
	}
	var boot struct {
		Statuses []struct{ ID int64 } `json:"statuses"`
	}
	if err := json.Unmarshal([]byte(out), &boot); err != nil || len(boot.Statuses) == 0 {
		t.Fatalf("bootstrap: %v %s", err, out)
	}
	if _, err := Call("POST", "/api/areas", `{"name":"Personal","key_prefix":"PR"}`); err != nil {
		t.Fatal(err)
	}
	if _, err := Call("GET", "/api/nope", ""); err == nil {
		t.Fatal("want an error for an unknown route")
	}

	// A second launch: the kept cookie is reused, no new sign-in.
	kept := Cookie()
	Stop()
	if err := Start(dir, "Asia/Kolkata", "me", "a-long-password", kept); err != nil {
		t.Fatal(err)
	}
	if Cookie() != kept {
		t.Fatal("kept cookie was not reused")
	}
}
