package db

import (
	"context"
	"testing"
)

const farFuture = int64(1) << 50

// A sync request comes from another device (or whoever holds a session), so
// the column names in it are not to be trusted: only columns the table has
// may be written, and nothing in a name may become SQL.
func TestSyncUpdateIgnoresColumnNamesThatAreNotColumns(t *testing.T) {
	ctx := context.Background()
	srv := openTest(t)
	a := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, a.ID, "Original")
	uid := mustUID(t, srv, "task", task.ID)

	evil := "title = 'pwned', description"
	row := SyncRow{
		Table: "task", UID: uid,
		Values: map[string]any{evil: "x", "no_such_column": "y", "title": "Renamed by sync"},
		Stamps: map[string]SyncStamp{evil: {Clock: farFuture, Device: "d"}, "no_such_column": {Clock: farFuture, Device: "d"}, "title": {Clock: farFuture, Device: "d"}},
	}
	if err := srv.ApplySync(ctx, []SyncRow{row}, true); err != nil {
		t.Fatalf("apply: %v", err)
	}
	var title string
	var desc *string
	if err := srv.QueryRowContext(ctx, `SELECT title, description FROM task WHERE id = ?`, task.ID).Scan(&title, &desc); err != nil {
		t.Fatal(err)
	}
	if title != "Renamed by sync" {
		t.Fatalf("a real column was not applied, or SQL in a column name ran: title = %q", title)
	}
	if desc != nil && *desc == "x" {
		t.Fatal("the column named inside the injected name was written")
	}
}

// The move log is only ever added to (SPEC): another device can send new
// moves, but not change or delete one already here.
func TestSyncCannotEditOrDeleteAMove(t *testing.T) {
	ctx := context.Background()
	srv := openTest(t)
	a := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, a.ID, "Moves")
	if _, err := srv.Move(ctx, task.ID, MoveRequest{StatusID: 3}); err != nil {
		t.Fatal(err)
	}
	var tid int64
	var at string
	if err := srv.QueryRowContext(ctx, `SELECT id, at FROM status_transition WHERE task_id = ? ORDER BY id DESC LIMIT 1`, task.ID).Scan(&tid, &at); err != nil {
		t.Fatal(err)
	}
	uid := mustUID(t, srv, "status_transition", tid)

	edit := SyncRow{Table: "status_transition", UID: uid, Values: map[string]any{"at": "2000-01-01 00:00:00"}, Stamps: map[string]SyncStamp{"at": {Clock: farFuture, Device: "d"}}}
	gone := SyncRow{Table: "status_transition", UID: uid, Stamps: map[string]SyncStamp{"_deleted": {Clock: farFuture + 1, Device: "d"}}}
	for _, r := range []SyncRow{edit, gone} {
		if err := srv.ApplySync(ctx, []SyncRow{r}, true); err != nil {
			t.Fatal(err)
		}
	}
	var now string
	if err := srv.QueryRowContext(ctx, `SELECT at FROM status_transition WHERE id = ?`, tid).Scan(&now); err != nil {
		t.Fatalf("the move was deleted by sync: %v", err)
	}
	if now != at {
		t.Fatalf("the move was edited by sync: %q -> %q", at, now)
	}
}
