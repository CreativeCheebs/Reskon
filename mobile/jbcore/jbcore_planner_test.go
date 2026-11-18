package jbcore

import (
	"encoding/json"
	"strings"
	"testing"
)

// The calls the phone makes that its screens depend on the exact shape of: the
// timer 409's body, a task line getting a new id when rescheduled, a day's
// override being cleared with null, and the order being saved.
func TestPlannerContractsThePhoneReliesOn(t *testing.T) {
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
	id := func(s string) int64 {
		t.Helper()
		var v struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal([]byte(s), &v); err != nil || v.ID == 0 {
			t.Fatalf("no id in %s (%v)", s, err)
		}
		return v.ID
	}
	area := id(call("POST", "/api/areas", `{"name":"Work","key_prefix":"WK"}`))
	task := id(call("POST", "/api/tasks", `{"title":"Write notes","area_id":`+itoa(area)+`,"estimate_h":2,"today":"2026-11-18"}`))
	ev1 := id(call("POST", "/api/day/2026-11-18/items", `{"title":"One","planned_min":10}`))
	ev2 := id(call("POST", "/api/day/2026-11-18/items", `{"title":"Two","planned_min":20}`))
	line := id(call("POST", "/api/day/2026-11-18/items", `{"task_id":`+itoa(task)+`}`))

	// PUT order: the saved order is what the day reads back.
	call("PUT", "/api/day/2026-11-18/order", `{"ids":[`+itoa(line)+`,`+itoa(ev2)+`,`+itoa(ev1)+`]}`)
	var day struct {
		Items []struct {
			ID int64 `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(call("GET", "/api/day/2026-11-18", "")), &day); err != nil || len(day.Items) != 3 ||
		day.Items[0].ID != line || day.Items[1].ID != ev2 || day.Items[2].ID != ev1 {
		t.Fatalf("order not kept: %v %+v", err, day.Items)
	}

	// A day's own available time wins; null gives the weekday's back.
	call("PUT", "/api/settings/planner_available", `{"wed":480}`)
	call("PATCH", "/api/day/2026-11-18", `{"available_min":60}`)
	if d := call("GET", "/api/day/2026-11-18", ""); !strings.Contains(d, `"available_min":60`) || !strings.Contains(d, `"available_from":"day"`) {
		t.Errorf("override not shown: %s", d)
	}
	call("PATCH", "/api/day/2026-11-18", `{"available_min":null}`)
	if d := call("GET", "/api/day/2026-11-18", ""); !strings.Contains(d, `"available_from":"weekday"`) {
		t.Errorf("null should bring the weekday back: %s", d)
	}

	// Rescheduling a task line: the answer is a line with a new id; an event keeps its id.
	moved := id(call("PATCH", "/api/day-items/"+itoa(line), `{"day":"2026-11-19"}`))
	if moved == line {
		t.Errorf("a rescheduled task line should have a new id")
	}
	if kept := id(call("PATCH", "/api/day-items/"+itoa(ev1), `{"day":"2026-11-19"}`)); kept != ev1 {
		t.Errorf("an event keeps its id when rescheduled: %d -> %d", ev1, kept)
	}

	// A second timer is a 409 whose body names the running one under current.timers.
	call("POST", "/api/timers", `{"day":"2026-11-18","day_item_id":`+itoa(ev2)+`}`)
	_, err := Call("POST", "/api/timers", `{"day":"2026-11-18","task_id":`+itoa(task)+`}`)
	if err == nil || !strings.HasPrefix(err.Error(), "409 ") {
		t.Fatalf("want a 409, got %v", err)
	}
	var busy struct {
		Current struct {
			Timers []struct {
				ID      int64 `json:"id"`
				Running bool  `json:"running"`
			} `json:"timers"`
		} `json:"current"`
	}
	if e := json.Unmarshal([]byte(strings.TrimPrefix(err.Error(), "409 ")), &busy); e != nil || len(busy.Current.Timers) != 1 || !busy.Current.Timers[0].Running {
		t.Errorf("409 body: %v %v", e, err)
	}
}

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
