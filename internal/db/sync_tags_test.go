package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func countRows(t *testing.T, d *DB, query string) int {
	t.Helper()
	var n int
	if err := d.QueryRowContext(context.Background(), query).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// tagsOnTask is the tag names on the task with this title, sorted as the app shows them.
func tagsOnTask(t *testing.T, d *DB, title string) string {
	t.Helper()
	return fmt.Sprint(tagsOf(t, d, taskByTitle(t, d, title).TagIDs))
}

// The same tag made on two devices is one tag, and the same tag added to the same task on both is one link.
func TestSyncMergesTheSameTagAndTheSameLink(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	mustTask(t, srv, home.ID, "Shared")
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	// Offline, both add "backend" (in different capitals) to the shared task, and each makes it elsewhere too.
	for _, side := range []struct {
		d    *DB
		name string
	}{{srv, "backend"}, {phone, "Backend"}} {
		tk := taskByTitle(t, side.d, "Shared")
		if _, err := side.d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"tags":[%q],"updated_at":%q}`, side.name, tk.UpdatedAt))); err != nil {
			t.Fatal(err)
		}
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		if n := countRows(t, d, `SELECT COUNT(*) FROM tag`); n != 1 {
			t.Errorf("%s has %d tags, want the one shared tag", name, n)
		}
		if n := countRows(t, d, `SELECT COUNT(*) FROM task_tag`); n != 1 {
			t.Errorf("%s has %d task_tag rows, want the one shared link", name, n)
		}
	}
	a, b := snapshot(t, srv), snapshot(t, phone)
	if len(a) != len(b) {
		t.Errorf("the two sides differ: %d rows against %d", len(a), len(b))
	}
	for k, v := range a {
		if b[k] != v {
			t.Errorf("%s differs:\n server %s\n phone  %s", k, v, b[k])
		}
	}
}

func TestSyncRemovingATagFromATaskReachesTheOtherDevice(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	tk, err := srv.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Shared","area_id":%d,"tags":["a","b"]}`, home.ID)))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if got := tagsOnTask(t, phone, "Shared"); got != "[a b]" {
		t.Fatalf("the phone got %s", got)
	}

	// The phone drops "a"; the server must follow.
	pt := taskByTitle(t, phone, "Shared")
	if _, err := phone.PatchTask(ctx, pt.ID, fields(t, fmt.Sprintf(`{"tags":["b"],"updated_at":%q}`, pt.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if got := tagsOnTask(t, srv, "Shared"); got != "[b]" {
		t.Errorf("the server has %s after the phone removed a", got)
	}
	_ = tk
}

// Deleting a tag that is still on things leaves it gone on both devices. Tags arrive before the
// links that use them, so this is where a foreign-key error would show.
func TestSyncDeletingATagInUseReachesTheOtherDevice(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task, err := srv.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Shared","area_id":%d,"tags":["gone","stays"]}`, home.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := srv.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","tags":["gone"]}`, task.ID))); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if n := countRows(t, phone, `SELECT COUNT(*) FROM tag`); n != 2 {
		t.Fatalf("the phone has %d tags before the delete", n)
	}

	if err := phone.DeleteTag(ctx, tagID(t, phone, "gone")); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		if got := fmt.Sprint(tagNames(t, d)); got != "[stays]" {
			t.Errorf("%s tags = %s, want only stays", name, got)
		}
		if n := countRows(t, d, `SELECT COUNT(*) FROM task_tag`); n != 1 {
			t.Errorf("%s has %d task links, want 1", name, n)
		}
		if n := countRows(t, d, `SELECT COUNT(*) FROM session_tag`); n != 0 {
			t.Errorf("%s still has %d session tags", name, n)
		}
	}
}

// A tag put on a session by hand travels with the session; the task's tags show up through the task.
func TestSyncCarriesSessionTagsAndInheritedOnesFollowTheTask(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, phone, "Home", "HM")
	task, err := phone.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Shared","area_id":%d,"tags":["backend"]}`, home.ID)))
	if err != nil {
		t.Fatal(err)
	}
	s, err := phone.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","tags":["urgent"]}`, task.ID)))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	sessions, err := srv.ListSessions(ctx, SessionQuery{})
	if err != nil || len(sessions) != 1 {
		t.Fatalf("server sessions = %v, %v", sessions, err)
	}
	if got := len(sessions[0].Tags); got != 2 {
		t.Fatalf("the server session has %d tags, want backend (task) and urgent", got)
	}

	// The task's tags change on the server; the phone's session follows.
	st := taskByTitle(t, srv, "Shared")
	if _, err := srv.PatchTask(ctx, st.ID, fields(t, fmt.Sprintf(`{"tags":["ui"],"updated_at":%q}`, st.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	got, err := phone.GetSession(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, g := range got.Tags {
		var n string
		phone.QueryRowContext(ctx, `SELECT name FROM tag WHERE id = ?`, g.TagID).Scan(&n)
		names[n] = g.FromTask
	}
	if len(names) != 2 || names["ui"] != true || names["urgent"] != false {
		t.Errorf("the phone's session tags = %v, want ui from the task and urgent by hand", names)
	}
}

// A deleted tag's id is never handed out again, so a new tag made after it never inherits its sync record
// (which would send the new tag to the other device as a deletion).
func TestSyncANewTagAfterDeletingTheNewestOneReachesTheOtherDevice(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task, err := srv.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"Shared","area_id":%d,"tags":["old"]}`, home.ID)))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	// Delete the newest tag (and so the newest link), then make new ones.
	if err := srv.DeleteTag(ctx, tagID(t, srv, "old")); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":["fresh"],"updated_at":%q}`, mustTaskUpdatedAt(t, srv, task.ID)))); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		if got := fmt.Sprint(tagNames(t, d)); got != "[fresh]" {
			t.Errorf("%s tags = %s, want only fresh", name, got)
		}
		if got := tagsOnTask(t, d, "Shared"); got != "[fresh]" {
			t.Errorf("%s: the task has %s, want fresh", name, got)
		}
	}
}

// A device that was offline puts a tag on a session that the server has since deleted. Its push must still
// go through: one stale session cannot stop a device from ever syncing again.
func TestSyncASessionNamingADeletedTagDoesNotStopTheSync(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, home.ID, "Shared")
	s, err := srv.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","tags":["gone"]}`, task.ID)))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	// The server deletes the tag; the phone, not knowing, puts it (and another) on its copy of the session.
	if err := srv.DeleteTag(ctx, tagID(t, srv, "gone")); err != nil {
		t.Fatal(err)
	}
	ps, err := phone.ListSessions(ctx, SessionQuery{})
	if err != nil || len(ps) != 1 {
		t.Fatalf("phone sessions = %v, %v", ps, err)
	}
	if _, err := phone.PatchSession(ctx, ps[0].ID, fields(t, `{"tags":["gone","kept"]}`)); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	got, err := srv.GetSession(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tags) != 1 || tagsOf(t, srv, []int64{got.Tags[0].TagID})[0] != "kept" {
		t.Errorf("the server's session tags = %+v, want only kept (gone is deleted)", got.Tags)
	}
}

// A view's filter by tag holds tag ids: they must mean the same tag on the other device.
func TestSyncAViewsTagFilterMeansTheSameTagOnTheOtherDevice(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	// Different tag ids on the two devices, so a raw id would point at the wrong tag.
	if _, err := phone.CreateTag(ctx, "decoy-one"); err != nil {
		t.Fatal(err)
	}
	if _, err := phone.CreateTag(ctx, "decoy-two"); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.CreateTag(ctx, "target"); err != nil {
		t.Fatal(err)
	}
	v := viewWith(t, srv, fmt.Sprintf(`{"tags":[%d,0]}`, tagID(t, srv, "target")))
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	var uid string
	if err := srv.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = 'view' AND id = ?`, v).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	pv, ok := idOf(ctx, phone, "view", uid)
	if !ok {
		t.Fatal("the view did not reach the phone")
	}
	var filter string
	if err := phone.QueryRowContext(ctx, `SELECT filter FROM view WHERE id = ?`, pv).Scan(&filter); err != nil {
		t.Fatal(err)
	}
	want := fmt.Sprintf(`"tags":[%d,0]`, tagID(t, phone, "target"))
	if !strings.Contains(strings.ReplaceAll(filter, " ", ""), want) {
		t.Errorf("the phone's filter is %s, want the phone's own id for target in it (%s)", filter, want)
	}
}
