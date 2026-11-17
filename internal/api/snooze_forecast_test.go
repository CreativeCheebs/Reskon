package api

import (
	"encoding/json"
	"net/http"
	"testing"
)

// The forecast reads one person's snoozed tasks; nobody sees another's, and
// signed out is refused.
func TestSnoozeForecast(t *testing.T) {
	alice, bob := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task created
	alice.do("POST", "/api/tasks", m{"title": "Later", "area_id": area.ID, "estimate_h": 2}, &task)
	if code := alice.do("POST", "/api/tasks/"+itoa(task.ID)+"/snooze", m{"days": 1, "today": "2026-11-17"}, nil); code != 200 {
		t.Fatalf("snooze = %d", code)
	}
	type day struct {
		Date   string
		Hours  float64
		Points float64
	}
	read := func(c *client, path string) (int, []day) {
		code, body := c.raw("GET", path, "")
		var out []day
		_ = json.Unmarshal([]byte(body), &out)
		return code, out
	}
	path := "/api/snooze/forecast?dates=2026-11-17,2026-11-18"
	if code, out := read(alice, path); code != 200 || len(out) != 2 || out[0].Hours != 0 || out[1] != (day{"2026-11-18", 2, 2}) {
		t.Errorf("alice = %d %+v", code, out)
	}
	if code, out := read(alice, path+"&exclude="+itoa(task.ID)); code != 200 || out[1].Hours != 0 {
		t.Errorf("excluded = %d %+v", code, out)
	}
	if code, out := read(bob, path); code != 200 || len(out) != 2 || out[1].Hours != 0 || out[1].Points != 0 {
		t.Errorf("bob saw alice's snooze: %d %+v", code, out)
	}
	if code, _ := read(alice, "/api/snooze/forecast?dates=nope"); code != 400 {
		t.Errorf("bad date = %d, want 400", code)
	}
	if code, _ := read(alice, path+"&exclude=x"); code != 400 {
		t.Errorf("bad exclude = %d, want 400", code)
	}
	if code, _ := read(&client{t: t, url: alice.url, h: &http.Client{}}, path); code != 401 {
		t.Errorf("signed out = %d, want 401", code)
	}
}
