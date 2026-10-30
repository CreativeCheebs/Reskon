package db

import (
	"context"
	"path/filepath"
	"testing"
	"testing/fstest"
)

// Migration 003 must remap 1/2/4/8/16 onto 1-5 in tasks, sessions and view
// filters, keeping order. Build a database at version 2, put old values in,
// then open it normally so 003 runs.
func TestMigration003Difficulty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	upTo2 := fstest.MapFS{}
	for _, name := range []string{"001_init.sql", "002_epics_board_state.sql"} {
		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		upTo2["m/"+name] = &fstest.MapFile{Data: body}
	}
	old, err := OpenMigrated(path, upTo2, "m")
	if err != nil {
		t.Fatal(err)
	}
	now := Now()
	old.Exec(`INSERT INTO area (id, name, key_prefix) VALUES (1, 'A', 'A')`)
	for i, d := range []int{1, 2, 4, 8, 16} {
		old.Exec(`INSERT INTO task (key, title, area_id, status_id, difficulty, created_at, updated_at) VALUES (?, ?, 1, 2, ?, ?, ?)`,
			"A-"+string(rune('1'+i)), "t", d, now, now)
	}
	old.Exec(`INSERT INTO session (kind, energy_type_id, hours, difficulty, logged_for, created_at) VALUES ('task', 1, 1, 8, '2026-10-01', ?)`, now)
	old.Exec(`INSERT INTO view (name, layout, filter) VALUES ('hard', 'table', '{"difficulty_min":8,"areas":null}')`)
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	rows, _ := d.Query(`SELECT difficulty FROM task ORDER BY id`)
	var got []int
	for rows.Next() {
		var v int
		rows.Scan(&v)
		got = append(got, v)
	}
	rows.Close()
	want := []int{1, 2, 3, 4, 5}
	for i := range want {
		if i >= len(got) || got[i] != want[i] {
			t.Fatalf("task difficulties = %v, want %v", got, want)
		}
	}
	var sd int
	d.QueryRow(`SELECT difficulty FROM session`).Scan(&sd)
	if sd != 4 {
		t.Errorf("session difficulty = %d, want 4", sd)
	}
	var min int
	d.QueryRow(`SELECT json_extract(filter, '$.difficulty_min') FROM view WHERE name = 'hard'`).Scan(&min)
	if min != 4 {
		t.Errorf("view difficulty_min = %d, want 4", min)
	}
	// And the new rule holds: 6 is rejected, 5 accepted.
	ctx := context.Background()
	if _, err := d.CreateTask(ctx, fields(t, `{"title":"x","area_id":1,"difficulty":6}`)); err == nil {
		t.Error("difficulty 6 accepted")
	}
	if _, err := d.CreateTask(ctx, fields(t, `{"title":"x","area_id":1,"difficulty":5}`)); err != nil {
		t.Errorf("difficulty 5 rejected: %v", err)
	}
}

// Migration 005 backfills points on every spend session at the formula in
// force (hours x difficulty, else the task's, else 1), leaves restore
// sessions without points, and seeds the three default dashboards.
func TestMigration005PointsBackfillAndDashboards(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	upTo4 := fstest.MapFS{}
	for _, name := range []string{"001_init.sql", "002_epics_board_state.sql", "003_difficulty_1_to_5.sql", "004_view_look.sql"} {
		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		upTo4["m/"+name] = &fstest.MapFile{Data: body}
	}
	old, err := OpenMigrated(path, upTo4, "m")
	if err != nil {
		t.Fatal(err)
	}
	now := Now()
	old.Exec(`INSERT INTO area (id, name, key_prefix) VALUES (1, 'A', 'A')`)
	old.Exec(`INSERT INTO task (id, key, title, area_id, status_id, difficulty, created_at, updated_at) VALUES (1, 'A-1', 't', 1, 2, 3, ?, ?)`, now, now)
	ins := `INSERT INTO session (id, task_id, kind, energy_type_id, hours, difficulty, logged_for, created_at) VALUES (?, ?, 'task', ?, ?, ?, '2026-10-01', ?)`
	old.Exec(ins, 1, nil, 1, 2.0, 4, now)   // own difficulty: 8
	old.Exec(ins, 2, 1, 1, 1.5, nil, now)   // task's difficulty 3: 4.5
	old.Exec(ins, 3, nil, 2, 2.5, nil, now) // neither: 2.5
	old.Exec(ins, 4, nil, 4, 8.0, 2, now)   // Rest (restore): none
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	want := map[int64]*float64{1: ptr(8.0), 2: ptr(4.5), 3: ptr(2.5), 4: nil}
	for id, w := range want {
		var got *float64
		d.QueryRow(`SELECT points FROM session WHERE id = ?`, id).Scan(&got)
		if (got == nil) != (w == nil) || (got != nil && *got != *w) {
			t.Errorf("session %d points = %v, want %v", id, deref(got), deref(w))
		}
	}
	var dashboards, widgets int
	d.QueryRow(`SELECT COUNT(*) FROM dashboard WHERE is_builtin = 1`).Scan(&dashboards)
	d.QueryRow(`SELECT COUNT(DISTINCT dashboard_id) FROM widget`).Scan(&widgets)
	if dashboards != 3 || widgets != 3 {
		t.Errorf("dashboards = %d, with widgets = %d; want 3 and 3", dashboards, widgets)
	}
}

func ptr[T any](v T) *T { return &v }

func deref(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}
