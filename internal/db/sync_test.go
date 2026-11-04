package db

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

// syncOnce runs one sync of a device with a server the way the app does:
// push the device's own changes, then pull everything else.
func syncOnce(t *testing.T, dev, srv *DB) {
	t.Helper()
	ctx := context.Background()
	device, token, pushed, _ := dev.SyncState(ctx)
	out, upto, err := dev.ExportSync(ctx, pushed, device, "", pushed == 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.ApplySync(ctx, roundTrip(t, out), true); err != nil {
		t.Fatal(err)
	}
	in, newToken, err := srv.ExportSync(ctx, token, "", device, token == 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := dev.ApplySync(ctx, roundTrip(t, in), false); err != nil {
		t.Fatal(err)
	}
	if err := dev.SetSyncProgress(ctx, newToken, upto); err != nil {
		t.Fatal(err)
	}
}

// roundTrip sends rows through JSON, as the network does.
func roundTrip(t *testing.T, rows []SyncRow) []SyncRow {
	b, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	var out []SyncRow
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// snapshot is every synced row by uid, plus each task's status, as JSON.
func snapshot(t *testing.T, d *DB) map[string]string {
	t.Helper()
	ctx := context.Background()
	rows, _, err := d.ExportSync(ctx, 0, "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, r := range rows {
		if _, gone := r.Stamps["_deleted"]; gone {
			continue
		}
		v := r.Values
		if r.Table == "task" {
			id, _ := idOf(ctx, d, "task", r.UID)
			var st string
			d.QueryRowContext(ctx, `SELECT s.name FROM task t JOIN status s ON s.id = t.status_id WHERE t.id = ?`, id).Scan(&st)
			v["status"] = st
		}
		b, _ := json.Marshal(v)
		out[r.Table+" "+r.UID] = string(b)
	}
	return out
}

func taskByTitle(t *testing.T, d *DB, title string) *Task {
	t.Helper()
	var id int64
	if err := d.QueryRowContext(context.Background(), `SELECT id FROM task WHERE title = ?`, title).Scan(&id); err != nil {
		t.Fatalf("no task %q: %v", title, err)
	}
	tk, err := d.GetTask(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

// Two databases edit the same data offline, then sync both ways through
// the real export and apply. They must end up the same, row by row.
func TestSyncConvergesAfterConflictingOfflineEdits(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)

	// The server has data before the phone ever connects; the phone has its own.
	home := mustArea(t, srv, "Home", "HM")
	mustTask(t, srv, home.ID, "Shared")
	state, err := srv.CreateState(ctx, fields(t, `{"name":"Poor sleep","kind":"debuff","severity":2,"started_on":"2026-11-01","decay":"static"}`), "2026-11-04")
	if err != nil {
		t.Fatal(err)
	}
	mustTask(t, phone, mustArea(t, phone, "Phone area", "PH").ID, "Made offline on the phone")
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if taskByTitle(t, phone, "Shared").Key != "HM-1" || taskByTitle(t, srv, "Made offline on the phone") == nil {
		t.Fatal("first sync did not merge both sides")
	}

	// Offline, both sides change things.
	pShared := taskByTitle(t, phone, "Shared")
	if _, err := phone.PatchTask(ctx, pShared.ID, fields(t, fmt.Sprintf(`{"title":"Shared, renamed on the phone","updated_at":%q}`, pShared.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	sShared := taskByTitle(t, srv, "Shared")
	if _, err := srv.PatchTask(ctx, sShared.ID, fields(t, fmt.Sprintf(`{"priority_id":3,"updated_at":%q}`, sShared.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Move(ctx, sShared.ID, MoveRequest{StatusID: 3}); err != nil {
		t.Fatal(err)
	}
	pHome, _ := idOf(ctx, phone, "area", mustUID(t, srv, "area", home.ID))
	mustTask(t, phone, pHome, "Phone task")  // HM-2 on the phone
	mustTask(t, srv, home.ID, "Server task") // HM-2 on the server too
	if _, err := phone.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1.5,"energy_type_id":1,"difficulty":3,
		"energies":[{"energy_type_id":1,"share":0.7,"difficulty":3},{"energy_type_id":3,"share":0.3,"difficulty":2}],"logged_for":"2026-11-04"}`, pShared.ID))); err != nil {
		t.Fatal(err)
	}
	pState, _ := idOf(ctx, phone, "state", mustUID(t, srv, "state", state.ID))
	if _, err := phone.ExecContext(ctx, `UPDATE state SET note = 'edited on the phone' WHERE id = ?`, pState); err != nil {
		t.Fatal(err)
	}
	if err := srv.DeleteState(ctx, state.ID); err != nil {
		t.Fatal(err)
	}

	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	a, b := snapshot(t, srv), snapshot(t, phone)
	for k, v := range a {
		if b[k] != v {
			t.Errorf("%s differs:\n server %s\n phone  %s", k, v, b[k])
		}
	}
	for k := range b {
		if _, ok := a[k]; !ok {
			t.Errorf("%s only on the phone", k)
		}
	}

	shared := taskByTitle(t, srv, "Shared, renamed on the phone")
	if shared.PriorityID == nil || *shared.PriorityID != 3 {
		t.Errorf("server's priority change lost: %v", shared.PriorityID)
	}
	if shared.Behaviour != "in_progress" || taskByTitle(t, phone, "Shared, renamed on the phone").Behaviour != "in_progress" {
		t.Errorf("the move did not reach both sides")
	}
	pk, sk := taskByTitle(t, phone, "Phone task").Key, taskByTitle(t, phone, "Server task").Key
	if pk == sk {
		t.Errorf("task keys still collide: %s", pk)
	}
	if count(t, srv, "state") != 0 || count(t, phone, "state") != 0 {
		t.Errorf("a deleted state came back")
	}
	var parts int
	srv.QueryRowContext(ctx, `SELECT COUNT(*) FROM session_energy`).Scan(&parts)
	if parts != 2 {
		t.Errorf("session energy types on the server: %d, want 2", parts)
	}
}

func mustUID(t *testing.T, d *DB, table string, id int64) string {
	t.Helper()
	uid, ok := uidOf(context.Background(), d, table, id)
	if !ok {
		t.Fatalf("no uid for %s %d", table, id)
	}
	return uid
}
