package jbcore

import (
	"database/sql"
	"encoding/json"
	"strconv"
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

	// Export: a clean copy that holds the area written above.
	path, err := Export(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	copyDB, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer copyDB.Close()
	var n int
	if err := copyDB.QueryRow(`SELECT COUNT(*) FROM area WHERE name = 'Personal'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("exported copy: %d areas, %v", n, err)
	}
}

// The phone's own core lists Home first and answers its "yesterday" widgets
// with the same metrics code as the server, in the time zone it was started with.
func TestHomeDashboardAndYesterdayThroughTheCore(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop) // registered after the folder, so it runs first
	if err := Start(dir, "Asia/Kolkata", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	out, err := Call("GET", "/api/dashboards", "")
	if err != nil {
		t.Fatal(err)
	}
	var all []struct {
		Name    string `json:"name"`
		Widgets []struct {
			ID     int64  `json:"id"`
			Title  string `json:"title"`
			Source string `json:"source"`
		} `json:"widgets"`
	}
	if err := json.Unmarshal([]byte(out), &all); err != nil || len(all) < 2 || all[0].Name != "Home" {
		t.Fatalf("dashboards: %v %s", err, out)
	}
	asked := 0
	for _, w := range all[0].Widgets {
		if w.Source == "view" || w.Source == "states" {
			continue // not metrics (the board and the buffs row are drawn by the app, not asked here)
		}
		res, err := Call("GET", "/api/metrics?widget="+itoa(w.ID), "")
		if err != nil {
			t.Fatalf("%s: %v", w.Title, err)
		}
		var m struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		if err := json.Unmarshal([]byte(res), &m); err != nil {
			t.Fatal(err)
		}
		if w.Title == "Hours yesterday" || w.Title == "Points yesterday" {
			asked++
			if m.From == "" || m.From != m.To {
				t.Errorf("%s: %s..%s, want one day", w.Title, m.From, m.To)
			}
		}
	}
	if asked != 2 {
		t.Errorf("%d yesterday widgets answered, want 2", asked)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
