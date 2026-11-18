package jbcore

import (
	"encoding/json"
	"testing"
)

// The phone's snooze sheet works with no network: a task can be created
// already snoozed, and the forecast and the snooze setting are answered by the
// same code as on the server.
func TestSnoozeOnCreateAndForecastThroughTheCore(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop)
	if err := Start(dir, "Asia/Kolkata", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	area, err := Call("POST", "/api/areas", `{"name":"Personal","key_prefix":"PR"}`)
	if err != nil {
		t.Fatal(err)
	}
	var a struct{ ID int64 }
	if err := json.Unmarshal([]byte(area), &a); err != nil {
		t.Fatal(err)
	}
	body := func(extra string) string {
		return `{"title":"Renew passport","area_id":` + itoa(a.ID) + `,"estimate_h":2,"today":"2026-11-18"` + extra + `}`
	}
	out, err := Call("POST", "/api/tasks", body(`,"snooze_until":"2026-11-25"`))
	if err != nil {
		t.Fatal(err)
	}
	var task struct {
		ID           int64   `json:"id"`
		SnoozedUntil *string `json:"snoozed_until"`
	}
	if err := json.Unmarshal([]byte(out), &task); err != nil || task.SnoozedUntil == nil || *task.SnoozedUntil != "2026-11-25" {
		t.Fatalf("created: %v %s", err, out)
	}
	if _, err := Call("POST", "/api/tasks", body(`,"snooze_until":"2026-11-18"`)); err == nil {
		t.Error("snoozing until today should be refused")
	}

	// The forecast counts the snoozed task's 2 hours on its day, and nothing for the task being snoozed.
	hoursOn := func(path string) []float64 {
		fc, err := Call("GET", path, "")
		if err != nil {
			t.Fatal(err)
		}
		var days []struct {
			Hours float64 `json:"hours"`
		}
		if err := json.Unmarshal([]byte(fc), &days); err != nil {
			t.Fatalf("forecast: %v %s", err, fc)
		}
		var h []float64
		for _, d := range days {
			h = append(h, d.Hours)
		}
		return h
	}
	if h := hoursOn("/api/snooze/forecast?dates=2026-11-25,2026-11-26&exclude=0"); len(h) != 2 || h[0] != 2 || h[1] != 0 {
		t.Errorf("forecast hours = %v, want [2 0]", h)
	}
	if h := hoursOn("/api/snooze/forecast?dates=2026-11-25&exclude=" + itoa(task.ID)); len(h) != 1 || h[0] != 0 {
		t.Errorf("forecast excluding the task = %v, want [0]", h)
	}

	// The list and longest snooze are a setting the phone reads and writes through the same routes.
	if _, err := Call("PUT", "/api/settings/snooze", `{"max_days":14,"intervals":[1,7]}`); err != nil {
		t.Fatal(err)
	}
	if _, err := Call("POST", "/api/tasks", body(`,"snooze_until":"2026-12-05"`)); err == nil {
		t.Error("17 days with a 14 day limit should be refused")
	}
}
