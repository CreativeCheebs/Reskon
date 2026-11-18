package db

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"testing/fstest"
)

// Migration 023 adds the planner tables and columns to a database made at
// version 22, keeping what was there, and the new tables sync.
func TestMigration023UpgradeKeepsData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	upTo22 := fstest.MapFS{}
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "023_") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, n := range names {
		body, err := migrationFS.ReadFile("migrations/" + n)
		if err != nil {
			t.Fatal(err)
		}
		upTo22["m/"+n] = &fstest.MapFile{Data: body}
	}
	old, err := OpenMigrated(path, upTo22, "m")
	if err != nil {
		t.Fatal(err)
	}
	now := Now()
	old.Exec(`INSERT INTO day_plan (day, note) VALUES ('2026-11-01', 'old note')`)
	old.Exec(`INSERT INTO session (kind, label, energy_type_id, hours, logged_for, created_at) VALUES ('event', 'Bath', 4, 0.5, '2026-11-01', ?)`, now)
	old.Close()

	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var v int
	d.QueryRow(`PRAGMA user_version`).Scan(&v)
	if v < 23 {
		t.Errorf("user_version = %d, want at least 23", v)
	}
	var note string
	var avail *int64
	if err := d.QueryRow(`SELECT note, available_min FROM day_plan WHERE day = '2026-11-01'`).Scan(&note, &avail); err != nil || note != "old note" || avail != nil {
		t.Errorf("day_plan after upgrade: %q %v %v", note, avail, err)
	}
	var label string
	var item, ended *int64
	if err := d.QueryRow(`SELECT label, day_item_id, ended_at FROM session`).Scan(&label, &item, &ended); err != nil || label != "Bath" || item != nil || ended != nil {
		t.Errorf("session after upgrade: %q %v %v %v", label, item, ended, err)
	}
	for _, table := range []string{"day_item", "timer"} {
		if n := count(t, d, table); n != 0 {
			t.Errorf("%s has %d rows after upgrade", table, n)
		}
	}
}

// Plan items, a timer, a day's available time and a session's link to an
// item all travel between devices; a task planned on the same day on two
// devices stays one item.
func TestSyncPlannerRows(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	home := mustArea(t, srv, "Home", "HM")
	task := mustTask(t, srv, home.ID, "Shared")
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	pTask := taskByTitle(t, phone, "Shared")

	// Both devices plan the same task on the same day, offline.
	now := Now()
	for _, x := range []struct {
		d  *DB
		id int64
	}{{srv, task.ID}, {phone, pTask.ID}} {
		if _, err := x.d.ExecContext(ctx, `INSERT INTO day_item (day, kind, task_id, position, created_at, updated_at) VALUES ('2026-11-10', 'task', ?, 1, ?, ?)`, x.id, now, now); err != nil {
			t.Fatal(err)
		}
	}
	// The phone also plans an event, starts a timer on it and sets the day's time.
	if _, err := phone.ExecContext(ctx, `INSERT INTO day_item (day, kind, title, planned_min, position, created_at, updated_at) VALUES ('2026-11-10', 'event', 'Dentist', 60, 2, ?, ?)`, now, now); err != nil {
		t.Fatal(err)
	}
	var evID int64
	phone.QueryRow(`SELECT id FROM day_item WHERE kind = 'event'`).Scan(&evID)
	phone.ExecContext(ctx, `INSERT INTO timer (day, day_item_id, started_at, resumed_at, created_at, updated_at) VALUES ('2026-11-10', ?, ?, ?, ?, ?)`, evID, now, now, now, now)
	phone.ExecContext(ctx, `INSERT INTO day_plan (day, available_min) VALUES ('2026-11-10', 300)`)
	phone.ExecContext(ctx, `INSERT INTO session (kind, label, energy_type_id, hours, logged_for, day_item_id, created_at) VALUES ('event', 'Dentist', 4, 1, '2026-11-10', ?, ?)`, evID, now)

	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		var items, timers int
		d.QueryRow(`SELECT COUNT(*) FROM day_item WHERE deleted_at IS NULL`).Scan(&items)
		d.QueryRow(`SELECT COUNT(*) FROM timer`).Scan(&timers)
		if items != 2 || timers != 1 {
			t.Errorf("%s: %d items, %d timers, want 2 and 1 (the shared task planned twice is one item)", name, items, timers)
		}
		var avail int64
		if err := d.QueryRow(`SELECT available_min FROM day_plan WHERE day = '2026-11-10'`).Scan(&avail); err != nil || avail != 300 {
			t.Errorf("%s: available_min = %d %v", name, avail, err)
		}
		var title string
		err := d.QueryRow(`SELECT i.title FROM session s JOIN day_item i ON i.id = s.day_item_id`).Scan(&title)
		if err != nil || title != "Dentist" {
			t.Errorf("%s: session not linked to its event: %q %v", name, title, err)
		}
	}
	// A reschedule on the phone arrives on the server.
	phone.ExecContext(ctx, `UPDATE day_item SET day = '2026-11-12' WHERE id = ?`, evID)
	syncOnce(t, phone, srv)
	var day string
	if err := srv.QueryRow(`SELECT day FROM day_item WHERE kind = 'event'`).Scan(&day); err != nil || day != "2026-11-12" {
		t.Errorf("rescheduled event on the server: %q %v", day, err)
	}
	_ = fmt.Sprint
}
