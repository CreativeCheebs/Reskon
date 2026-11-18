package jbcore

import (
	"encoding/json"
	"strings"
	"testing"
)

// The phone's Day Planner works with no network: every planner route the app
// calls is answered by the core on the phone's own database.
func TestDayPlannerRoutesThroughTheCore(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop)
	if err := Start(dir, "Asia/Kolkata", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	call := func(method, path, body string) string {
		t.Helper()
		out, err := Call(method, path, body)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return out
	}
	// A weekday's available time and an event on the day.
	call("PUT", "/api/settings/planner_available", `{"wed":480}`)
	ev := call("POST", "/api/day/2026-11-18/items", `{"title":"Dentist","planned_min":45}`)
	var item struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(ev), &item); err != nil || item.ID == 0 {
		t.Fatalf("event: %v %s", err, ev)
	}
	day := call("GET", "/api/day/2026-11-18", "")
	for _, want := range []string{`"planned_min":45`, `"available_min":480`, `"available_from":"weekday"`, `"timers"`} {
		if !strings.Contains(day, want) {
			t.Errorf("day lacks %s: %s", want, day)
		}
	}
	call("PATCH", "/api/day/2026-11-18", `{"available_min":0,"note":"day off"}`)
	call("GET", "/api/day/2026-11-19/bring-forward", "")
	call("GET", "/api/days?from=2026-11-18&to=2026-11-20", "")

	// A timer on the event: a second one is refused with the running one; stop gives a draft that completes the event.
	call("POST", "/api/timers", `{"day":"2026-11-18","day_item_id":`+itoa(item.ID)+`}`)
	if _, err := Call("POST", "/api/timers", `{"day":"2026-11-18","day_item_id":`+itoa(item.ID)+`}`); err == nil || !strings.HasPrefix(err.Error(), "409") {
		t.Fatalf("second timer should be a 409, got %v", err)
	}
	var list struct {
		Timers []struct {
			ID int64 `json:"id"`
		} `json:"timers"`
	}
	if err := json.Unmarshal([]byte(call("GET", "/api/timers", "")), &list); err != nil || len(list.Timers) != 1 {
		t.Fatalf("timers: %v", err)
	}
	stop := call("POST", "/api/timers/"+itoa(list.Timers[0].ID)+"/stop", "")
	var st struct {
		Draft struct {
			Kind      string  `json:"kind"`
			DayItemID int64   `json:"day_item_id"`
			Hours     float64 `json:"hours"`
			StartedAt string  `json:"started_at"`
			EndedAt   string  `json:"ended_at"`
			LoggedFor string  `json:"logged_for"`
		} `json:"draft"`
	}
	if err := json.Unmarshal([]byte(stop), &st); err != nil || st.Draft.Kind != "event" || st.Draft.DayItemID != item.ID {
		t.Fatalf("draft: %v %s", err, stop)
	}
	energy := call("GET", "/api/bootstrap", "")
	var boot struct {
		EnergyTypes []struct {
			ID int64 `json:"id"`
		} `json:"energy_types"`
	}
	if err := json.Unmarshal([]byte(energy), &boot); err != nil || len(boot.EnergyTypes) == 0 {
		t.Fatalf("bootstrap: %v", err)
	}
	call("POST", "/api/sessions", `{"kind":"event","label":"Dentist","energy_type_id":`+itoa(boot.EnergyTypes[0].ID)+`,"hours":0.75,"logged_for":"2026-11-18","started_at":"`+st.Draft.StartedAt+`","ended_at":"`+st.Draft.EndedAt+`","day_item_id":`+itoa(item.ID)+`}`)
	if day := call("GET", "/api/day/2026-11-18", ""); !strings.Contains(day, `"done":true`) {
		t.Errorf("saving the session should complete the event: %s", day)
	}
}
