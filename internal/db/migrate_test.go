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

// Migrations 005 and 006 backfill points on every session at the formula
// in force (hours x rate x difficulty, else the task's, else 1; every rate
// starts at 1), old restore-type sessions included, and lay out the
// default dashboards.
func TestMigrations005And006PointsBackfillAndDashboards(t *testing.T) {
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
	old.Exec(ins, 4, nil, 4, 8.0, 2, now)   // Rest (an old restore type): 16 since 006
	old.Exec(ins, 5, nil, 5, 1.5, nil, now) // Leisure: 1.5
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	want := map[int64]*float64{1: ptr(8.0), 2: ptr(4.5), 3: ptr(2.5), 4: ptr(16.0), 5: ptr(1.5)}
	for id, w := range want {
		var got *float64
		d.QueryRow(`SELECT points FROM session WHERE id = ?`, id).Scan(&got)
		if (got == nil) != (w == nil) || (got != nil && *got != *w) {
			t.Errorf("session %d points = %v, want %v", id, deref(got), deref(w))
		}
	}
	var dashboards, widgets int
	d.QueryRow(`SELECT COUNT(*) FROM dashboard WHERE is_builtin = 1`).Scan(&dashboards)
	d.QueryRow(`SELECT COUNT(DISTINCT dashboard_id) FROM widget WHERE deleted_at IS NULL`).Scan(&widgets)
	if dashboards != 3 || widgets != 3 {
		t.Errorf("dashboards = %d, with widgets = %d; want 3 and 3", dashboards, widgets)
	}
	// No live widget still uses work_points or a direction filter, and the
	// new all-types widgets are there (two from 006, two running totals
	// from 007, which replace the single points running total).
	var stale, multiples, onePointsTotal int
	d.QueryRow(`SELECT COUNT(*) FROM widget WHERE deleted_at IS NULL AND (query LIKE '%work_points%' OR query LIKE '%direction%')`).Scan(&stale)
	d.QueryRow(`SELECT COUNT(*) FROM widget WHERE deleted_at IS NULL AND viz = 'small_multiples'`).Scan(&multiples)
	d.QueryRow(`SELECT COUNT(*) FROM widget WHERE deleted_at IS NULL AND viz = 'cumulative'`).Scan(&onePointsTotal)
	if stale != 0 || multiples != 4 || onePointsTotal != 0 {
		t.Errorf("stale widgets = %d, small multiples = %d, cumulative = %d; want 0, 4 and 0", stale, multiples, onePointsTotal)
	}
	var drift string
	d.QueryRow(`SELECT value FROM setting WHERE key = 'drift_energy_types'`).Scan(&drift)
	if drift != "[1,2,3]" {
		t.Errorf("drift_energy_types = %s, want the old spend types [1,2,3]", drift)
	}
}

func ptr[T any](v T) *T { return &v }

func deref(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

// Migration 006 on a database that already ran 005: a day's single
// ceiling answer is copied to each type that had a ceiling, and widgets on
// a dashboard of your own keep working (work_points becomes points, the
// direction filter goes) without being replaced.
func TestMigration006RewritesFeedbackAndOwnWidgets(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	upTo5 := fstest.MapFS{}
	for _, name := range []string{"001_init.sql", "002_epics_board_state.sql", "003_difficulty_1_to_5.sql", "004_view_look.sql", "005_dashboards_points.sql"} {
		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		upTo5["m/"+name] = &fstest.MapFile{Data: body}
	}
	old, err := OpenMigrated(path, upTo5, "m")
	if err != nil {
		t.Fatal(err)
	}
	old.Exec(`INSERT INTO day_plan (day, ceilings, ceiling_feedback) VALUES ('2026-10-20', '{"1": 8, "2": 0, "3": 2}', 'too_high')`)
	old.Exec(`INSERT INTO dashboard (id, name) VALUES (10, 'Mine')`)
	old.Exec(`INSERT INTO widget (id, dashboard_id, viz, query) VALUES
		(100, 10, 'bar', '{"metric":"work_points","group":"week"}'),
		(101, 10, 'bar', '{"metric":"session_hours","filters":{"direction":"restore","area":"Main job"}}')`)
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	day, err := d.GetDay(context.Background(), "2026-10-20")
	if err != nil {
		t.Fatal(err)
	}
	if fb := day.Plan.CeilingFeedback; len(fb) != 2 || fb["1"] != "too_high" || fb["3"] != "too_high" {
		t.Errorf("feedback = %v, want too_high for types 1 and 3 (2 had no ceiling)", fb)
	}
	for id, want := range map[int64]string{
		100: `{"metric":"points","group":"week"}`,
		101: `{"metric":"session_hours","filters":{"area":"Main job"}}`,
	} {
		var q string
		var deleted *string
		d.QueryRow(`SELECT query, deleted_at FROM widget WHERE id = ?`, id).Scan(&q, &deleted)
		if q != want || deleted != nil {
			t.Errorf("widget %d = %s (deleted %v), want %s", id, q, deleted, want)
		}
	}
}
