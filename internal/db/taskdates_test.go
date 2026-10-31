package db

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"testing/fstest"
)

// Seeded statuses: 1 Backlog, 2 To do (todo), 3 In progress, 4 Done,
// 5 Cancelled.
func TestDateRulesFillStartAndEnd(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	if tk.StartDate != nil || tk.EndDate != nil {
		t.Fatalf("new task has dates %v %v", tk.StartDate, tk.EndDate)
	}
	mv := func(status int64, today string) *Task {
		t.Helper()
		got, err := d.Move(ctx, tk.ID, MoveRequest{StatusID: status, Today: today})
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	if got := mv(3, "2026-10-01"); str(got.StartDate) != "2026-10-01" || got.EndDate != nil {
		t.Errorf("into in progress: start %q end %q", str(got.StartDate), str(got.EndDate))
	}
	// Start is filled only once.
	mv(2, "2026-10-02")
	if got := mv(3, "2026-10-03"); str(got.StartDate) != "2026-10-01" {
		t.Errorf("start overwritten: %q", str(got.StartDate))
	}
	if got := mv(4, "2026-10-05"); str(got.EndDate) != "2026-10-05" {
		t.Errorf("into done: end %q", str(got.EndDate))
	}
	// Done to Cancelled keeps the end date; reopening clears it.
	if got := mv(5, "2026-10-06"); str(got.EndDate) != "2026-10-05" {
		t.Errorf("done to cancelled: end %q", str(got.EndDate))
	}
	if got := mv(3, "2026-10-07"); got.EndDate != nil {
		t.Errorf("reopened: end %q, want empty", str(got.EndDate))
	}

	// Manual only: moves leave both alone. Start on To do instead.
	if err := d.PutSetting(ctx, "task_dates", json.RawMessage(`{"start_auto":true,"start_statuses":[2],"end_auto":false}`)); err != nil {
		t.Fatal(err)
	}
	other := mustTask(t, d, a.ID, "y") // created into To do
	if other.StartDate == nil || other.EndDate != nil {
		t.Errorf("created into a start status: start %v", other.StartDate)
	}
	tk, _ = d.GetTask(ctx, tk.ID)
	if _, err := d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"updated_at":%q,"end_date":"2026-09-30"}`, tk.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	if got := mv(2, "2026-10-08"); str(got.EndDate) != "2026-09-30" {
		t.Errorf("manual end changed by a move: %q", str(got.EndDate))
	}
	tk, _ = d.GetTask(ctx, tk.ID)
	if _, err := d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"updated_at":%q,"start_date":"soon"}`, tk.UpdatedAt))); err == nil {
		t.Error("want an error for a bad start_date")
	}
}

// Migration 010 copies the Jira import's start_date custom field into the
// column and retires the definition, keeping the JSON value.
func TestMigration010CopiesStartDate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	upTo9 := fstest.MapFS{}
	entries, _ := migrationFS.ReadDir("migrations")
	for _, e := range entries {
		if e.Name() < "010" {
			body, _ := migrationFS.ReadFile("migrations/" + e.Name())
			upTo9["m/"+e.Name()] = &fstest.MapFile{Data: body}
		}
	}
	old, err := OpenMigrated(path, upTo9, "m")
	if err != nil {
		t.Fatal(err)
	}
	now := Now()
	old.Exec(`INSERT INTO area (id, name, key_prefix) VALUES (1, 'A', 'A')`)
	ins := `INSERT INTO task (id, key, title, area_id, status_id, custom, created_at, updated_at) VALUES (?, ?, 't', 1, 2, ?, ?, ?)`
	old.Exec(ins, 1, "A-1", `{"start_date":"2026-05-24"}`, now, now)
	old.Exec(ins, 2, "A-2", `{"start_date":"not a date"}`, now, now)
	old.Exec(ins, 3, "A-3", `{}`, now, now)
	old.Exec(`INSERT INTO custom_field (entity, key, label, type) VALUES ('task', 'start_date', 'Start date', 'date')`)
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	for id, want := range map[int64]string{1: "2026-05-24", 2: "", 3: ""} {
		var got *string
		d.QueryRow(`SELECT start_date FROM task WHERE id = ?`, id).Scan(&got)
		if (got == nil) != (want == "") || (got != nil && *got != want) {
			t.Errorf("task %d start_date = %v, want %q", id, got, want)
		}
	}
	var custom string
	var live int
	d.QueryRow(`SELECT custom FROM task WHERE id = 1`).Scan(&custom)
	d.QueryRow(`SELECT COUNT(*) FROM custom_field WHERE key = 'start_date' AND deleted_at IS NULL`).Scan(&live)
	if custom != `{"start_date":"2026-05-24"}` || live != 0 {
		t.Errorf("custom = %s, live definitions = %d", custom, live)
	}
}
