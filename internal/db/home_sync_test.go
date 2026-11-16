package db

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"testing"
)

// Home reaching devices that are not upgraded at the same moment. An older
// phone is a database left at migration 019 (with sync triggers), kept open
// without the new migration until the test upgrades it.

func homeOf(t *testing.T, d *DB) *Dashboard {
	t.Helper()
	all, err := d.ListDashboards(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var home *Dashboard
	for _, x := range all {
		if x.Name == "Home" {
			if home != nil {
				t.Fatalf("two Home dashboards: %s", dashboardNames(all))
			}
			home = x
		}
	}
	if home == nil {
		t.Fatalf("no Home: %s", dashboardNames(all))
	}
	return home
}

// homeSummary is Home's widgets as "title x,y wxh", sorted, to compare two devices.
func homeSummary(t *testing.T, d *DB) string {
	t.Helper()
	var out []string
	for _, w := range homeOf(t, d).Widgets {
		out = append(out, fmt.Sprintf("%s %d,%d %dx%d", *w.Title, w.X, w.Y, w.W, w.H))
	}
	sort.Strings(out)
	return strings.Join(out, " | ")
}

func widgetNamed(t *testing.T, d *DB, title string) *Widget {
	t.Helper()
	for _, w := range homeOf(t, d).Widgets {
		if *w.Title == title {
			return w
		}
	}
	t.Fatalf("no Home widget %q", title)
	return nil
}

func markCount(d interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, tbl string, id int64, field string) int {
	var n int
	d.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM sync_field WHERE tbl = ? AND key = ? AND field = ?`, tbl, fmt.Sprint(id), field).Scan(&n)
	return n
}

// An edit made on a phone that is not upgraded yet (Home was sent to it by
// the server) is still waiting to be pushed after the upgrade, and reaches
// the server; so does an unrelated edit made at the same time.
func TestUnpushedEditsOnAnOldPhoneSurviveItsUpgrade(t *testing.T) {
	ctx := context.Background()
	srv := openTest(t)
	path := openBefore020(t, nil)
	raw := openRaw(t, path)
	phone := &DB{raw}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	hours := widgetNamed(t, phone, "Hours yesterday")
	if _, err := phone.PatchWidget(ctx, hours.ID, fields(t, `{"x":2}`)); err != nil {
		t.Fatal(err)
	}
	today, _ := phone.ListDashboards(ctx)
	var todayID int64
	for _, x := range today {
		if x.Name == "Today" {
			todayID = x.ID
		}
	}
	if _, err := phone.PatchDashboard(ctx, todayID, fields(t, `{"name":"Today, renamed"}`)); err != nil {
		t.Fatal(err)
	}
	if markCount(raw, "widget", hours.ID, "x") != 1 || markCount(raw, "dashboard", todayID, "name") != 1 {
		t.Fatal("the edits were not marked")
	}
	raw.Close()

	up, err := Open(path) // migration 020 runs here
	if err != nil {
		t.Fatal(err)
	}
	defer up.Close()
	if markCount(up, "widget", hours.ID, "x") != 1 || markCount(up, "dashboard", todayID, "name") != 1 {
		t.Fatal("the upgrade lost an unpushed edit")
	}
	syncOnce(t, up, srv)
	syncOnce(t, up, srv)
	if got := widgetNamed(t, srv, "Hours yesterday").X; got != 2 {
		t.Errorf("the server's widget x = %d, want 2 (the edit made before the phone upgraded)", got)
	}
	var name string
	srv.QueryRowContext(ctx, `SELECT d.name FROM dashboard d JOIN sync_idmap m ON m.tbl = 'dashboard' AND m.id = d.id WHERE m.uid = 'b-dashboard-1'`).Scan(&name)
	if name != "Today, renamed" {
		t.Errorf("the server's Today = %q", name)
	}
	if homeSummary(t, srv) != homeSummary(t, up) {
		t.Errorf("Home differs:\n server %s\n phone  %s", homeSummary(t, srv), homeSummary(t, up))
	}
}

// A phone already paired with a server that has not been upgraded yet, then the
// server is upgraded and its Home is changed and added to before the phone is.
// The phone ends up with the same single Home, with no widget doubled.
func TestAnOldPairedPhoneReceivesChangesToHomeThenUpgrades(t *testing.T) {
	ctx := context.Background()
	srvPath, phonePath := openBefore020(t, nil), openBefore020(t, nil)
	srvRaw, phoneRaw := openRaw(t, srvPath), openRaw(t, phonePath)
	phone := &DB{phoneRaw}
	syncOnce(t, phone, &DB{srvRaw})
	syncOnce(t, phone, &DB{srvRaw})
	srvRaw.Close()

	srv, err := Open(srvPath) // the server upgrades first: Home is made and marked
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	home := homeOf(t, srv)
	hours := widgetNamed(t, srv, "Hours yesterday")
	if _, err := srv.PatchWidget(ctx, hours.ID, fields(t, `{"title":"Hours, yesterday","w":3}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.CreateWidget(ctx, fields(t, fmt.Sprintf(`{"dashboard_id":%d,"title":"Sessions yesterday","viz":"number","query":{"metric":"session_count","group":"day","range":"yesterday"}}`, home.ID))); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	if got := homeSummary(t, phone); got != homeSummary(t, srv) {
		t.Fatalf("before the upgrade:\n server %s\n phone  %s", homeSummary(t, srv), got)
	}
	phoneRaw.Close()

	up, err := Open(phonePath)
	if err != nil {
		t.Fatal(err)
	}
	defer up.Close()
	if got := homeSummary(t, up); got != homeSummary(t, srv) {
		t.Errorf("after the upgrade:\n server %s\n phone  %s", homeSummary(t, srv), got)
	}
	syncOnce(t, up, srv)
	syncOnce(t, up, srv)
	if homeSummary(t, up) != homeSummary(t, srv) {
		t.Errorf("after syncing again:\n server %s\n phone  %s", homeSummary(t, srv), homeSummary(t, up))
	}
	for name, d := range map[string]*DB{"server": srv, "phone": up} {
		all, _ := d.ListDashboards(ctx)
		if dashboardNames(all) != "Home|Today|This month|The year" || len(homeOf(t, d).Widgets) != 6 {
			t.Errorf("%s: %s, %d Home widgets", name, dashboardNames(all), len(homeOf(t, d).Widgets))
		}
	}
}
