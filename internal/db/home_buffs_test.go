package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
)

// Migration 022 puts the Buffs and debuffs widget at the top of every Home.

func openUpTo022(t *testing.T, seed func(*sql.DB)) *DB {
	t.Helper()
	path := openBefore(t, "022_", seed)
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func statesCount(t *testing.T, d *DB) int {
	t.Helper()
	n := 0
	for _, w := range homeOf(t, d).Widgets {
		if w.Source == SourceStates {
			n++
		}
	}
	return n
}

// layoutOf is "title x,y wxh" of Home's widgets other than the buffs one.
func layoutOf(t *testing.T, d *DB) string {
	t.Helper()
	var out []string
	for _, w := range homeOf(t, d).Widgets {
		if w.Source != SourceStates {
			out = append(out, fmt.Sprintf("%s %d,%d %dx%d", *w.Title, w.X, w.Y, w.W, w.H))
		}
	}
	return strings.Join(out, " | ")
}

func TestHomeBuffsOnAnExistingHome(t *testing.T) {
	ctx := context.Background()
	path := openBefore(t, "022_", nil)
	raw := openRaw(t, path)
	before := &DB{raw}
	was := layoutOf(t, before)
	raw.Close()
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	home := homeOf(t, d)
	first := home.Widgets[0]
	if first.Source != SourceStates || first.Viz != VizStates || *first.Title != "Buffs and debuffs" ||
		first.X != 0 || first.Y != 0 || first.W != 12 || first.H != 2 || string(first.Query) != "{}" {
		t.Fatalf("first widget = %+v", first)
	}
	if statesCount(t, d) != 1 {
		t.Errorf("%d buffs widgets", statesCount(t, d))
	}
	// Every other widget is the same, two rows lower.
	var moved []string
	for _, w := range home.Widgets[1:] {
		moved = append(moved, fmt.Sprintf("%s %d,%d %dx%d", *w.Title, w.X, w.Y-2, w.W, w.H))
	}
	if strings.Join(moved, " | ") != was {
		t.Errorf("layout changed:\n was %s\n now %s", was, strings.Join(moved, " | "))
	}
	if uid, ok := uidOf(ctx, d, "widget", first.ID); !ok || uid != "b-widget-home-buffs" {
		t.Errorf("uid = %q", uid)
	}
	layoutAfter := layoutOf(t, d)
	// It is marked changed so it travels, and a second open adds nothing.
	if markCount(d, "widget", first.ID, "_row") != 1 {
		t.Errorf("no new-row mark on the buffs widget")
	}
	d.Close()
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if statesCount(t, d) != 1 || layoutOf(t, d) != layoutAfter {
		t.Errorf("a second open changed Home: was %s, now %s", layoutAfter, layoutOf(t, d))
	}
}

func TestHomeBuffsAlreadyThere(t *testing.T) {
	d := openUpTo022(t, func(s *sql.DB) {
		mustExec(t, s, `INSERT INTO widget (dashboard_id, title, source, viz, query, x, y, w, h, position)
			SELECT id, 'My buffs', 'states', 'states', '{}', 4, 9, 4, 3, 7 FROM dashboard WHERE name = 'Home'`)
	})
	home := homeOf(t, d)
	if statesCount(t, d) != 1 {
		t.Fatalf("%d buffs widgets, want just the one already there", statesCount(t, d))
	}
	for _, w := range home.Widgets {
		if w.Source == SourceStates && (*w.Title != "My buffs" || w.X != 4 || w.Y != 9) {
			t.Errorf("the existing widget was changed: %+v", w)
		}
		if *w.Title == "Hours yesterday" && w.Y != 0 {
			t.Errorf("a widget was moved: %+v", w)
		}
	}
	// A deleted buffs widget does not count.
	d2 := openUpTo022(t, func(s *sql.DB) {
		mustExec(t, s, `INSERT INTO widget (dashboard_id, title, source, viz, query, deleted_at)
			SELECT id, 'Old', 'states', 'states', '{}', '2026-01-01T00:00:00Z' FROM dashboard WHERE name = 'Home'`)
	})
	if statesCount(t, d2) != 1 || *homeOf(t, d2).Widgets[0].Title != "Buffs and debuffs" {
		t.Errorf("a deleted buffs widget stopped the new one")
	}
}

func TestHomeBuffsHomeDeletedOrRenamed(t *testing.T) {
	ctx := context.Background()
	// Deleted: nothing is added anywhere, and nothing is brought back.
	d := openUpTo022(t, func(s *sql.DB) {
		mustExec(t, s, `UPDATE dashboard SET deleted_at = '2026-01-01T00:00:00Z' WHERE name = 'Home'`)
	})
	var n int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM widget WHERE source = 'states'`).Scan(&n)
	if n != 0 {
		t.Errorf("%d buffs widgets were added with Home deleted", n)
	}
	all, _ := d.ListDashboards(ctx)
	if strings.Contains(dashboardNames(all), "Home") {
		t.Errorf("a deleted Home came back: %s", dashboardNames(all))
	}
	// Renamed: it is still Home (the same dashboard), so it gets the widget.
	d = openUpTo022(t, func(s *sql.DB) {
		mustExec(t, s, `UPDATE dashboard SET name = 'My start page' WHERE name = 'Home'`)
	})
	all, _ = d.ListDashboards(ctx)
	if all[0].Name != "My start page" || all[0].Widgets[0].Source != SourceStates {
		t.Errorf("renamed Home: %s, first widget %+v", all[0].Name, all[0].Widgets[0])
	}
	// A dashboard of the person's own that is called Home is not touched.
	d = openUpTo022(t, func(s *sql.DB) {
		mustExec(t, s, `UPDATE dashboard SET deleted_at = '2026-01-01T00:00:00Z' WHERE name = 'Home'`)
		mustExec(t, s, `INSERT INTO dashboard (id, name, position) VALUES (40, 'Home', 9)`)
	})
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM widget WHERE source = 'states'`).Scan(&n)
	if n != 0 {
		t.Errorf("a dashboard of the person's own got the widget")
	}
}

// The widget reaches another device once, with the same identity, whether
// that device upgrades before or after the server, and the widget another
// device was already sent is not doubled.
func TestHomeBuffsSyncs(t *testing.T) {
	ctx := context.Background()
	// Server and phone both start new: each makes the widget, and they merge into one.
	srv, phone := openTest(t), openTest(t)
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	for name, d := range map[string]*DB{"server": srv, "phone": phone} {
		if statesCount(t, d) != 1 || len(homeOf(t, d).Widgets) != 6 {
			t.Errorf("%s: %d buffs widgets, %d in all", name, statesCount(t, d), len(homeOf(t, d).Widgets))
		}
	}
	// A phone left at 021 gets the server's widget by sync before it upgrades, then upgrades.
	path := openBefore(t, "022_", nil)
	raw := openRaw(t, path)
	old := &DB{raw}
	syncOnce(t, old, srv)
	syncOnce(t, old, srv)
	var n int
	raw.QueryRow(`SELECT COUNT(*) FROM widget WHERE source = 'states'`).Scan(&n)
	if n != 1 {
		t.Fatalf("the old phone was sent %d buffs widgets", n)
	}
	raw.Close()
	up, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer up.Close()
	if statesCount(t, up) != 1 {
		t.Errorf("after the upgrade: %d buffs widgets", statesCount(t, up))
	}
	// Nothing was moved by the upgrade, so Home still matches the server's.
	if homeSummary(t, up) != homeSummary(t, srv) {
		t.Errorf("after the upgrade:\n server %s\n phone  %s", homeSummary(t, srv), homeSummary(t, up))
	}
	syncOnce(t, up, srv)
	syncOnce(t, up, srv)
	if homeSummary(t, up) != homeSummary(t, srv) || statesCount(t, up) != 1 || statesCount(t, srv) != 1 {
		t.Errorf("after syncing again:\n server %s\n phone  %s", homeSummary(t, srv), homeSummary(t, up))
	}
	w := homeOf(t, up).Widgets[0]
	if uid, ok := uidOf(ctx, up, "widget", w.ID); !ok || uid != "b-widget-home-buffs" {
		t.Errorf("uid = %q", uid)
	}
}
