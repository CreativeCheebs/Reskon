package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// A board widget is saved through the ordinary widgets call, names a view
// that exists in that person's own data, and reads its tasks through the
// call the board uses; it never reaches the metrics or app calls.
func TestViewWidgets(t *testing.T) {
	srv, _ := newServerWith(t)
	alice := newClient(t, srv)
	alice.do("POST", "/api/auth/setup", m{"username": "alice", "password": "first password"}, nil)
	alice.do("POST", "/api/users", m{"username": "bob", "password": "bobs password"}, nil)
	bob := newClient(t, srv)
	bob.do("POST", "/api/auth/login", m{"username": "bob", "password": "bobs password"}, nil)

	// Alice has a view of her own; Bob's data has no such view.
	code, body := alice.raw("POST", "/api/views", `{"name":"Work","layout":"board","filter":{}}`)
	var view struct{ ID int64 }
	if code != 200 || json.Unmarshal([]byte(body), &view) != nil || view.ID == 0 {
		t.Fatalf("view = %d %s", code, body)
	}
	save := func(c *client, q string) (int, string) {
		return c.raw("POST", "/api/widgets", `{"dashboard_id":1,"source":"view","title":"Open","query":`+q+`,"w":8,"h":5}`)
	}
	code, body = save(alice, `{"view_id":`+itoa64(view.ID)+`}`)
	var w struct {
		ID          int64
		Source, Viz string
	}
	if code != 200 || json.Unmarshal([]byte(body), &w) != nil || w.Source != "view" || w.Viz != "board" {
		t.Fatalf("saving a board widget = %d %s", code, body)
	}
	if code, _ := alice.raw("GET", "/api/tasks?view="+itoa64(view.ID), ""); code != 200 {
		t.Errorf("the view's tasks = %d", code)
	}
	for _, bad := range []string{`{}`, `{"view_id":0}`, `{"view_id":99999}`, `{"view_id":` + itoa64(view.ID) + `,"filter":{}}`} {
		if code, body := save(alice, bad); code != 400 {
			t.Errorf("%s = %d %s", bad, code, body)
		}
	}
	// Bob has the same kind of data but not Alice's view: he can neither save
	// a widget for it nor read its tasks.
	if code, body := save(bob, `{"view_id":`+itoa64(view.ID)+`}`); code != 400 || !strings.Contains(body, "view ") || strings.Contains(body, "dashboard") {
		t.Errorf("bob naming alice's view = %d %s", code, body)
	}
	if code, _ := bob.raw("GET", "/api/tasks?view="+itoa64(view.ID), ""); code != 404 {
		t.Errorf("bob reading alice's view = %d", code)
	}
	// A view that was deleted cannot be picked, but the widget it was made for stays.
	if code, _ := alice.raw("DELETE", "/api/views/"+itoa64(view.ID), ""); code != 200 {
		t.Fatalf("deleting the view = %d", code)
	}
	if code, body := save(alice, `{"view_id":`+itoa64(view.ID)+`}`); code != 400 || !strings.Contains(body, "view ") || !strings.Contains(body, "does not exist") {
		t.Errorf("a deleted view = %d %s", code, body)
	}
	if code, body := alice.raw("PATCH", "/api/widgets/"+itoa64(w.ID), `{"title":"Still here","y":3}`); code != 200 {
		t.Errorf("renaming a widget whose view is gone = %d %s", code, body)
	}
	// It is not a metric, and not an app's data or page.
	if code, _ := alice.raw("GET", "/api/metrics?widget="+itoa64(w.ID), ""); code != 400 {
		t.Errorf("board widget as a metric = %d", code)
	}
	if code, _ := alice.raw("GET", "/api/apps/data?widget="+itoa64(w.ID), ""); code != 400 && code != 404 {
		t.Errorf("board widget as app data = %d", code)
	}
}
