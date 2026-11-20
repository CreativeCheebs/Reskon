package api

import (
	"net/http"
	"testing"
)

// Continue and next round work over HTTP for the owner of the task only.
func TestContinueAndNextRoundRoutes(t *testing.T) {
	alice, bob := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task created
	alice.do("POST", "/api/tasks", m{"title": "Set up NVR", "area_id": area.ID}, &task)

	var next struct {
		ID        int64  `json:"id"`
		FollowsID *int64 `json:"follows_id"`
		EpicID    *int64 `json:"epic_id"`
	}
	if code := alice.do("POST", "/api/tasks/"+itoa(task.ID)+"/continue", m{"title": "Wire garage camera", "epic": "new"}, &next); code != 200 {
		t.Fatalf("continue = %d", code)
	}
	if next.FollowsID == nil || *next.FollowsID != task.ID || next.EpicID == nil {
		t.Errorf("continue answer = %+v", next)
	}
	if code := alice.do("POST", "/api/tasks/"+itoa(task.ID)+"/continue", m{"title": ""}, nil); code != 400 {
		t.Errorf("empty title = %d, want 400", code)
	}

	var round struct {
		RoundNo   *int64  `json:"round_no"`
		RoundKind *string `json:"round_kind"`
	}
	if code := alice.do("POST", "/api/tasks/"+itoa(task.ID)+"/next-round", m{"kind": "version"}, &round); code != 200 {
		t.Fatalf("next round = %d", code)
	}
	if round.RoundNo == nil || *round.RoundNo != 2 || *round.RoundKind != "version" {
		t.Errorf("round = %+v", round)
	}
	if code := alice.do("POST", "/api/tasks/"+itoa(task.ID)+"/round-kind", m{"kind": "round"}, nil); code != 200 {
		t.Errorf("round kind = %d", code)
	}

	// Bob has no such task in his own database.
	if code := bob.do("POST", "/api/tasks/"+itoa(task.ID)+"/continue", m{"title": "x"}, nil); code != 404 {
		t.Errorf("bob continue = %d, want 404", code)
	}
	if code := bob.do("POST", "/api/tasks/"+itoa(task.ID)+"/next-round", m{}, nil); code != 404 {
		t.Errorf("bob next round = %d, want 404", code)
	}
	anon := &client{t: t, url: alice.url, h: &http.Client{}}
	if code := anon.do("POST", "/api/tasks/"+itoa(task.ID)+"/continue", m{"title": "x"}, nil); code != 401 {
		t.Errorf("signed out = %d, want 401", code)
	}
}
