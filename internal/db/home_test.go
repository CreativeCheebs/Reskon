package db

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

// Migration 020 gives everyone a Home dashboard shown before the others.

// openBefore020 makes a database as an older Reskon left it: migrated up to
// 019 and, like one that has been opened before, with the sync triggers in
// place. seed may add rows; the file is then closed and returned.
func openBefore020(t *testing.T, seed func(*sql.DB)) string {
	t.Helper()
	return openBefore(t, "020_", seed)
}

// openBefore is openBefore020 for any migration: every migration whose file
// name sorts before first is applied, none from first on.
func openBefore(t *testing.T, first string, seed func(*sql.DB)) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "old.db")
	old := fstest.MapFS{}
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() >= first {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			t.Fatal(err)
		}
		old["m/"+e.Name()] = &fstest.MapFile{Data: body}
	}
	sqldb, err := OpenMigrated(path, old, "m")
	if err != nil {
		t.Fatal(err)
	}
	if err := installSyncTriggers(context.Background(), sqldb); err != nil {
		t.Fatal(err)
	}
	if seed != nil {
		seed(sqldb)
	}
	if err := sqldb.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func mustExec(t *testing.T, d *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := d.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func dashboardNames(all []*Dashboard) string {
	var n []string
	for _, x := range all {
		n = append(n, x.Name)
	}
	return strings.Join(n, "|")
}

func widgetTitles(x *Dashboard) string {
	var n []string
	for _, w := range x.Widgets {
		n = append(n, *w.Title)
	}
	return strings.Join(n, "|")
}

// A new account: Home first, then the three others; the board shows the
// only view there is (a table view, since a board view only appears with
// the first area), and every other widget is a metric the server runs.
func TestHomeOnANewDatabase(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if dashboardNames(all) != "Home|Today|This month|The year" {
		t.Fatalf("dashboards = %s", dashboardNames(all))
	}
	home := all[0]
	if !home.IsBuiltin || home.Position != -1 {
		t.Errorf("home = %+v", home)
	}
	if got := widgetTitles(home); got != "Buffs and debuffs|Open tasks|Hours yesterday|Points yesterday|Points, last 7 days|Hours, last 7 days" {
		t.Fatalf("widgets = %s", got)
	}
	views, _ := d.ListViews(ctx)
	board := home.Widgets[1]
	if board.Source != SourceView || board.Viz != VizBoard || len(views) == 0 || string(board.Query) != fmt.Sprintf(`{"view_id":%d}`, views[0].ID) {
		t.Errorf("board = %+v, views = %+v", board, views)
	}
	for _, w := range home.Widgets {
		if w.X < 0 || w.X+w.W > 12 || w.W < 1 || w.H < 1 {
			t.Errorf("%s does not fit the 12 columns: %+v", *w.Title, w)
		}
		if w.Source != SourceMetric {
			continue
		}
		q, err := ParseWidgetQuery(w.Query)
		if err != nil {
			t.Fatalf("%s: %v", *w.Title, err)
		}
		if _, err := d.Metric(ctx, q, d.Now(ctx)); err != nil {
			t.Errorf("%s: %v", *w.Title, err)
		}
	}
	for _, c := range []struct{ title, viz, metric, rng string }{
		{"Hours yesterday", "number", "session_hours", "yesterday"},
		{"Points yesterday", "number", "points", "yesterday"},
		{"Points, last 7 days", "bar", "points", "7d"},
		{"Hours, last 7 days", "bar", "session_hours", "7d"},
	} {
		var found bool
		for _, w := range home.Widgets {
			if *w.Title != c.title {
				continue
			}
			found = true
			q, _ := ParseWidgetQuery(w.Query)
			if w.Viz != c.viz || q.Metric != c.metric || q.Range != c.rng || q.Group != "day" {
				t.Errorf("%s = %s %+v", c.title, w.Viz, q)
			}
		}
		if !found {
			t.Errorf("no widget %q", c.title)
		}
	}
	// Fixed uids, the same on every device.
	var n int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM sync_idmap WHERE (tbl = 'dashboard' AND uid = 'b-dashboard-home')
		OR (tbl = 'widget' AND uid LIKE 'b-widget-home-%')`).Scan(&n)
	if n != 7 {
		t.Errorf("fixed uids = %d, want 7", n)
	}
}

// An existing database: Home goes first, the board is the first board view
// by position (not a table view with a lower position, and not chosen by
// name), nothing else is moved, and a dashboard already called Home stays.
func TestHomeOnAnExistingDatabase(t *testing.T) {
	path := openBefore020(t, func(s *sql.DB) {
		mustExec(t, s, `INSERT INTO dashboard (id, name, position) VALUES (10, 'Home', 5), (11, 'Mine', 3)`)
		mustExec(t, s, `INSERT INTO widget (dashboard_id, title, viz, query) VALUES (10, 'Old', 'number', '{"metric":"points","range":"today"}')`)
		// The seeded table view is at 1000; these board views come later by position, "Zed" first.
		mustExec(t, s, `INSERT INTO view (id, name, layout, position) VALUES (20, 'Done', 'board', 2000), (21, 'Zed', 'board', 1500), (22, 'Aaa', 'table', 0)`)
	})
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	all, err := d.ListDashboards(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if dashboardNames(all) != "Home|Today|This month|The year|Mine|Home" {
		t.Fatalf("dashboards = %s", dashboardNames(all))
	}
	home := all[0]
	if home.Position != -1 || len(home.Widgets) != 6 || string(home.Widgets[1].Query) != `{"view_id":21}` {
		t.Errorf("home = %+v, board = %s", home, home.Widgets[1].Query)
	}
	// What was there is exactly as it was.
	positions := map[string]int64{}
	for _, x := range all[1:] {
		positions[fmt.Sprintf("%s%d", x.Name, x.ID)] = x.Position
	}
	want := map[string]int64{"Today1": 0, "This month2": 1, "The year3": 2, "Home10": 5, "Mine11": 3}
	for k, v := range want {
		if positions[k] != v {
			t.Errorf("%s moved to %d, want %d (all: %v)", k, positions[k], v, positions)
		}
	}
	for _, x := range all {
		if x.ID == 10 && widgetTitles(x) != "Old" {
			t.Errorf("the old Home's widgets = %s", widgetTitles(x))
		}
	}
	// The triggers were live while it ran: the fixed uids are in place of random ones,
	// and the marks the migration made are kept, so Home travels through normal sync.
	var marks int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM sync_field WHERE (tbl = 'dashboard' AND key = ? AND field = '_row') OR (tbl = 'widget' AND field = '_row' AND key IN (
		SELECT CAST(id AS TEXT) FROM widget WHERE dashboard_id = ?))`, fmt.Sprint(home.ID), home.ID).Scan(&marks)
	if marks != 7 {
		t.Errorf("%d new-row marks on Home and its widgets, want 7", marks)
	}
	if uid, ok := uidOf(ctx, d, "dashboard", home.ID); !ok || uid != "b-dashboard-home" {
		t.Errorf("home's uid = %q", uid)
	}
	if uid, ok := uidOf(ctx, d, "widget", home.Widgets[1].ID); !ok || uid != "b-widget-home-board" {
		t.Errorf("board's uid = %q", uid)
	}
	// Opening again changes nothing.
	d.Close()
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	again, _ := d.ListDashboards(ctx)
	if dashboardNames(again) != dashboardNames(all) {
		t.Errorf("after a second open: %s", dashboardNames(again))
	}
	d.Close()
}

// With no board view the first view of any layout is used; with no view at
// all Home has no board and still works.
func TestHomeBoardViewChoice(t *testing.T) {
	path := openBefore020(t, func(s *sql.DB) {
		mustExec(t, s, `INSERT INTO view (id, name, layout, position) VALUES (30, 'Later', 'table', 1200), (31, 'Gone', 'board', 0)`)
		mustExec(t, s, `UPDATE view SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 31`)
	})
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	all, _ := d.ListDashboards(ctx)
	d.Close()
	// The seeded "Everything" (1000) comes before "Later" (1200); the deleted board view is not used.
	var first int64
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	d.QueryRowContext(ctx, `SELECT id FROM view WHERE deleted_at IS NULL ORDER BY position, id LIMIT 1`).Scan(&first)
	d.Close()
	if string(all[0].Widgets[1].Query) != fmt.Sprintf(`{"view_id":%d}`, first) || first == 30 || first == 31 {
		t.Errorf("board = %s, want view %d", all[0].Widgets[1].Query, first)
	}

	path = openBefore020(t, func(s *sql.DB) {
		mustExec(t, s, `UPDATE view SET deleted_at = '2026-01-01T00:00:00Z'`)
	})
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	all, _ = d.ListDashboards(ctx)
	if all[0].Name != "Home" || widgetTitles(all[0]) != "Buffs and debuffs|Hours yesterday|Points yesterday|Points, last 7 days|Hours, last 7 days" {
		t.Errorf("with no views: %s: %s", all[0].Name, widgetTitles(all[0]))
	}
}

// Two devices each make Home; after syncing there is still exactly one on
// each, and the same goes for an older phone that was sent Home before it
// upgraded.
func TestHomeSyncsAsOneDashboard(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		all, _ := d.ListDashboards(ctx)
		if dashboardNames(all) != "Home|Today|This month|The year" {
			t.Errorf("%s: %s", name, dashboardNames(all))
		}
		for _, x := range all {
			if x.Name == "Home" && len(x.Widgets) != 6 {
				t.Errorf("%s: Home has %d widgets", name, len(x.Widgets))
			}
		}
	}

	// A phone still on the old version when the server already has Home.
	srv2 := openTest(t)
	// The server's Home reaches the phone before the phone upgrades.
	path := openBefore020(t, nil)
	raw := openRaw(t, path)
	phone2 := &DB{raw}
	syncOnce(t, phone2, srv2)
	syncOnce(t, phone2, srv2)
	var homes int
	raw.QueryRow(`SELECT COUNT(*) FROM dashboard WHERE name = 'Home'`).Scan(&homes)
	if homes != 1 {
		t.Fatalf("the phone was sent %d Homes", homes)
	}
	raw.Close()
	up, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer up.Close()
	all, _ := up.ListDashboards(ctx)
	if dashboardNames(all) != "Home|Today|This month|The year" {
		t.Errorf("after upgrading: %s", dashboardNames(all))
	}
	if len(all[0].Widgets) != 6 {
		t.Errorf("Home has %d widgets after upgrading", len(all[0].Widgets))
	}
	var uids int
	up.QueryRowContext(ctx, `SELECT COUNT(*) FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'`).Scan(&uids)
	if uids != 1 {
		t.Errorf("%d rows with Home's uid", uids)
	}
}

// openRaw opens a database file without migrating it further.
func openRaw(t *testing.T, path string) *sql.DB {
	t.Helper()
	s, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_txlock=immediate&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", path))
	if err != nil {
		t.Fatal(err)
	}
	s.SetMaxOpenConns(1)
	return s
}
