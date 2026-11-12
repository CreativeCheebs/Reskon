package api

import (
	"fmt"
	"testing"
)

type created struct {
	ID        int64  `json:"id"`
	UpdatedAt string `json:"updated_at"`
}

// signedInAs sets up a server with Alice (admin) and Bob, each in their own client.
func twoUsers(t *testing.T) (alice, bob *client) {
	t.Helper()
	srv := newServer(t)
	alice = newClient(t, srv)
	if code := alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "alice has a password"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	if code := alice.do("POST", "/api/users", m{"username": "bob", "password": "bob has a password"}, nil); code != 200 {
		t.Fatalf("create bob = %d", code)
	}
	bob = newClient(t, srv)
	if code := bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bob has a password"}, nil); code != 200 {
		t.Fatalf("bob login = %d", code)
	}
	return alice, bob
}

// The core promise: one person's records cannot be reached by another, even
// by guessing their numeric ids. Bob has no data, so every id of Alice's is
// one that does not exist in Bob's own database.
func TestAnotherUserCannotReachRecordsByID(t *testing.T) {
	alice, bob := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task created
	alice.do("POST", "/api/tasks", m{"title": "Alice's private task", "area_id": area.ID}, &task)
	var session created
	if code := alice.do("POST", "/api/sessions", m{"task_id": task.ID, "hours": 1, "energy_type_id": 1, "difficulty": 2, "logged_for": "2026-11-04"}, &session); code != 200 {
		t.Fatalf("alice session = %d", code)
	}
	var tag created
	if code := alice.do("POST", "/api/tags", m{"name": "private"}, &tag); code != 200 || tag.ID == 0 {
		t.Fatalf("alice tag = %d %+v", code, tag)
	}
	if task.ID == 0 || session.ID == 0 {
		t.Fatalf("setup failed: task %+v session %+v", task, session)
	}

	cases := []struct {
		name, method, path string
		body               any
	}{
		{"read a task", "GET", fmt.Sprintf("/api/tasks/%d", task.ID), nil},
		{"edit a task", "PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), m{"title": "taken over", "updated_at": task.UpdatedAt}},
		{"move a task", "POST", fmt.Sprintf("/api/tasks/%d/move", task.ID), m{"status_id": 3}},
		{"read a task's history", "GET", fmt.Sprintf("/api/tasks/%d/transitions", task.ID), nil},
		{"edit a session", "PATCH", fmt.Sprintf("/api/sessions/%d", session.ID), m{"hours": 9}},
		{"delete tasks together", "POST", "/api/tasks/delete", m{"task_ids": []int64{task.ID}}},
		{"rename a tag", "PATCH", fmt.Sprintf("/api/tags/%d", tag.ID), m{"name": "taken over"}},
		{"delete a tag", "DELETE", fmt.Sprintf("/api/tags/%d", tag.ID), nil},
	}
	for _, c := range cases {
		if code := bob.do(c.method, c.path, c.body, nil); code != 404 {
			t.Errorf("bob tries to %s: status %d, want 404", c.name, code)
		}
	}

	// And nothing was changed for Alice.
	var got struct{ Title string }
	alice.do("GET", fmt.Sprintf("/api/tasks/%d", task.ID), nil, &got)
	if got.Title != "Alice's private task" {
		t.Fatalf("alice's task is now %q", got.Title)
	}
}

// A stale updated_at over HTTP is a 409 that carries the row as it is now,
// so the client can retry (AGENTS.md, optimistic concurrency).
func TestStaleEditIsA409WithTheCurrentRow(t *testing.T) {
	alice, _ := twoUsers(t)
	var area created
	alice.do("POST", "/api/areas", m{"name": "Home", "key_prefix": "HM"}, &area)
	var task created
	alice.do("POST", "/api/tasks", m{"title": "Shared", "area_id": area.ID}, &task)

	if code := alice.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), m{"title": "First edit", "updated_at": task.UpdatedAt}, nil); code != 200 {
		t.Fatalf("first edit = %d", code)
	}
	var conflict struct {
		Error   string `json:"error"`
		Detail  string `json:"detail"`
		Current struct {
			Title     string `json:"title"`
			UpdatedAt string `json:"updated_at"`
		} `json:"current"`
	}
	code := alice.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), m{"title": "Second edit, stale", "updated_at": task.UpdatedAt}, &conflict)
	if code != 409 {
		t.Fatalf("stale edit = %d, want 409", code)
	}
	if conflict.Error != "conflict" || conflict.Current.Title != "First edit" || conflict.Current.UpdatedAt == "" {
		t.Fatalf("409 body = %+v", conflict)
	}
}

// SPEC section 3: the last admin cannot be demoted or disabled. The refusal
// reaches the screen as a 409 with its reason, not a bare server error.
func TestLastAdminCannotBeDemotedOrDisabled(t *testing.T) {
	alice, _ := twoUsers(t)
	var me struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	alice.do("GET", "/api/auth/status", nil, &me)
	for _, body := range []m{{"is_admin": false}, {"disabled": true}} {
		var out struct {
			Error  string `json:"error"`
			Detail string `json:"detail"`
		}
		code := alice.do("PATCH", fmt.Sprintf("/api/users/%d", me.User.ID), body, &out)
		if code != 409 || out.Detail == "" {
			t.Errorf("%v: status %d detail %q, want 409 with a reason", body, code, out.Detail)
		}
	}
}
