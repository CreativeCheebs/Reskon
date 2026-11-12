package api

import (
	"fmt"
	"testing"
)

// Tags over HTTP: made by a task or session naming them, listed with counts, renamed and deleted.
func TestTagsOverHTTP(t *testing.T) {
	alice, _ := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task struct {
		ID     int64   `json:"id"`
		TagIDs []int64 `json:"tag_ids"`
	}
	if code := alice.do("POST", "/api/tasks", m{"title": "t", "area_id": area.ID, "tags": []string{"backend", "ui"}}, &task); code != 200 || len(task.TagIDs) != 2 {
		t.Fatalf("create task with tags = %d %+v", code, task)
	}

	var tags []struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Tasks int    `json:"task_count"`
	}
	alice.do("GET", "/api/tags", nil, &tags)
	if len(tags) != 2 || tags[0].Name != "backend" || tags[0].Tasks != 1 {
		t.Fatalf("tags = %+v", tags)
	}

	// The bootstrap carries the list for the screens.
	var boot struct {
		Tags []struct{ Name string } `json:"tags"`
	}
	alice.do("GET", "/api/bootstrap", nil, &boot)
	if len(boot.Tags) != 2 {
		t.Errorf("bootstrap tags = %+v", boot.Tags)
	}

	if code := alice.do("PATCH", fmt.Sprintf("/api/tags/%d", tags[0].ID), m{"name": "UI"}, nil); code != 400 && code != 409 {
		t.Errorf("a rename onto another tag's name gave %d, want a refusal", code)
	}
	if code := alice.do("PATCH", fmt.Sprintf("/api/tags/%d", tags[0].ID), m{"name": "api"}, nil); code != 200 {
		t.Errorf("rename = %d", code)
	}
	if code := alice.do("POST", "/api/tags", m{"name": "a,b"}, nil); code != 400 {
		t.Errorf("a name with a comma gave %d, want 400", code)
	}

	// A session carries its task's tags, and can be found by one.
	var session created
	if code := alice.do("POST", "/api/sessions", m{"task_id": task.ID, "hours": 1, "energy_type_id": 1, "logged_for": "2026-11-04", "tags": []string{"urgent"}}, &session); code != 200 {
		t.Fatalf("session = %d", code)
	}
	var got []struct {
		Tags []struct {
			TagID    int64 `json:"tag_id"`
			FromTask bool  `json:"from_task"`
		} `json:"tags"`
	}
	alice.do("GET", fmt.Sprintf("/api/sessions?tag=%d", tags[1].ID), nil, &got)
	if len(got) != 1 || len(got[0].Tags) != 3 {
		t.Errorf("sessions with the task's tag = %+v", got)
	}

	if code := alice.do("DELETE", fmt.Sprintf("/api/tags/%d", tags[1].ID), nil, nil); code != 200 {
		t.Errorf("delete = %d", code)
	}
	alice.do("GET", "/api/tags", nil, &tags)
	if len(tags) != 2 { // api and urgent
		t.Errorf("tags after the delete = %+v", tags)
	}
}
