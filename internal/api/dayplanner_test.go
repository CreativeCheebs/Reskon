package api

import (
	"fmt"
	"testing"
)

// The planner over HTTP: plan a task and an event, available time, a timer,
// stop to a draft, save the draft, and the event is done.
func TestDayPlannerOverHTTP(t *testing.T) {
	alice, bob := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task created
	alice.do("POST", "/api/tasks", m{"title": "Write", "area_id": area.ID, "estimate_h": 2}, &task)

	var item struct {
		ID         int64  `json:"id"`
		PlannedMin *int64 `json:"planned_min"`
	}
	if code := alice.do("POST", "/api/day/2026-11-16/items", m{"task_id": task.ID}, &item); code != 200 || *item.PlannedMin != 120 {
		t.Fatalf("plan a task = %d %+v", code, item)
	}
	if code := alice.do("POST", "/api/day/2026-11-16/items", m{"task_id": task.ID}, nil); code != 409 {
		t.Errorf("planning it twice = %d, want 409", code)
	}
	var ev struct {
		ID int64 `json:"id"`
	}
	alice.do("POST", "/api/day/2026-11-16/items", m{"title": "Dentist", "planned_min": 45, "area_id": area.ID}, &ev)

	alice.do("PUT", "/api/settings/planner_available", m{"mon": 120}, nil)
	var day struct {
		Items      []struct{ ID int64 } `json:"items"`
		PlanTotals struct {
			PlannedMin   int64  `json:"planned_min"`
			AvailableMin *int64 `json:"available_min"`
			Over         bool   `json:"over"`
		} `json:"plan_totals"`
		Timers struct {
			Timers []struct{} `json:"timers"`
		} `json:"timers"`
	}
	alice.do("GET", "/api/day/2026-11-16", nil, &day)
	if len(day.Items) != 2 || day.PlanTotals.PlannedMin != 165 || day.PlanTotals.AvailableMin == nil || *day.PlanTotals.AvailableMin != 120 || !day.PlanTotals.Over {
		t.Errorf("day = %+v", day)
	}
	var days []struct {
		Day string `json:"day"`
	}
	if code := alice.do("GET", "/api/days?from=2026-11-15&to=2026-11-17", nil, &days); code != 200 || len(days) != 3 {
		t.Errorf("days = %d %+v", code, days)
	}
	if code := alice.do("PUT", fmt.Sprintf("/api/day/2026-11-16/order"), m{"ids": []int64{ev.ID, item.ID}}, nil); code != 200 {
		t.Errorf("order = %d", code)
	}
	var cands []struct {
		TaskID int64 `json:"task_id"`
	}
	alice.do("GET", "/api/day/2026-11-17/bring-forward", nil, &cands)
	if len(cands) != 1 || cands[0].TaskID != task.ID {
		t.Errorf("bring-forward candidates = %+v", cands)
	}
	if code := alice.do("POST", "/api/day/2026-11-17/bring-forward", m{"task_ids": []int64{task.ID}}, nil); code != 200 {
		t.Errorf("bring forward = %d", code)
	}

	// Timer on the event.
	var tm struct {
		ID      int64 `json:"id"`
		Running bool  `json:"running"`
	}
	if code := alice.do("POST", "/api/timers", m{"day": "2026-11-16", "day_item_id": ev.ID}, &tm); code != 200 || !tm.Running {
		t.Fatalf("start = %d %+v", code, tm)
	}
	if code := alice.do("POST", "/api/timers", m{"day": "2026-11-16", "task_id": task.ID}, nil); code != 409 {
		t.Errorf("second timer = %d, want 409", code)
	}
	if code := alice.do("POST", fmt.Sprintf("/api/timers/%d/pause", tm.ID), nil, nil); code != 200 {
		t.Errorf("pause = %d", code)
	}
	if code := alice.do("POST", fmt.Sprintf("/api/timers/%d/resume", tm.ID), nil, nil); code != 200 {
		t.Errorf("resume = %d", code)
	}
	var stopped struct {
		Draft map[string]any `json:"draft"`
	}
	if code := alice.do("POST", fmt.Sprintf("/api/timers/%d/stop", tm.ID), nil, &stopped); code != 200 || stopped.Draft["day_item_id"] == nil {
		t.Fatalf("stop = %d %+v", code, stopped)
	}
	// Elapsed is under a second, so the draft's hours would be refused; the user edits them.
	stopped.Draft["hours"] = 0.75
	stopped.Draft["energy_type_id"] = 1 // the event has no area default to take it from
	if code := alice.do("POST", "/api/sessions", stopped.Draft, nil); code != 200 {
		t.Fatalf("saving the draft = %d", code)
	}
	var after struct {
		Items []struct {
			ID   int64 `json:"id"`
			Done bool  `json:"done"`
		} `json:"items"`
	}
	alice.do("GET", "/api/day/2026-11-16", nil, &after)
	done := false
	for _, it := range after.Items {
		if it.ID == ev.ID {
			done = it.Done
		}
	}
	if !done {
		t.Errorf("the event is not done after its session: %+v", after.Items)
	}

	// Another user sees none of it.
	var theirs struct {
		Items []struct{} `json:"items"`
	}
	bob.do("GET", "/api/day/2026-11-16", nil, &theirs)
	if len(theirs.Items) != 0 {
		t.Errorf("bob sees alice's plan: %+v", theirs)
	}
	if code := bob.do("DELETE", fmt.Sprintf("/api/day-items/%d", item.ID), nil, nil); code != 404 {
		t.Errorf("bob deleting alice's item = %d, want 404", code)
	}
}
