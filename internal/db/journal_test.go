package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func logSession(t *testing.T, d *DB, js string) *Session {
	t.Helper()
	s, err := d.CreateSession(context.Background(), fields(t, js))
	if err != nil {
		t.Fatalf("%s: %v", js, err)
	}
	return s
}

// The owner's example: times where a session has them (in the person's own
// time zone), the task's title and never its key, the area, hours, notes
// indented under their line, and the day's totals in the heading.
func TestJournalMarkdown(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if err := d.PutSetting(ctx, "time_zone", []byte(`"Asia/Kolkata"`)); err != nil {
		t.Fatal(err)
	}
	home := mustArea(t, d, "Home", "HOM")
	learning := mustArea(t, d, "Learning", "LRN")
	tk := mustTask(t, d, home.ID, "Fix backup script")

	// 03:30 UTC is 09:00 in Kolkata. A Windows-style note, with a blank line in it.
	logSession(t, d, fmt.Sprintf(`{"task_id":%d,"hours":1.5,"points":10,"logged_for":"2026-11-15","started_at":"2026-11-15T03:30:00Z",
		"note":"Found the cron path was wrong; fixed and tested.\r\n\r\nNext: add a check.  \r\n\r\n"}`, tk.ID))
	logSession(t, d, fmt.Sprintf(`{"kind":"event","label":"Reading","hours":0.75,"points":32,"area_id":%d,"logged_for":"2026-11-15"}`, learning.ID))
	// Another day, which must not leak into this one.
	logSession(t, d, `{"kind":"event","label":"Walk","hours":1,"energy_type_id":1,"points":1,"logged_for":"2026-11-14"}`)

	j, err := d.Journal(ctx, "2026-11-15", "2026-11-15", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(j.Days) != 1 {
		t.Fatalf("days = %d", len(j.Days))
	}
	// A line that another follows ends with two spaces (a hard line break).
	want := "## Sunday 15 November 2026 — 2h 15m, 42 points\n" +
		"- 09:00–10:30 · Fix backup script (Home) — 1h 30m  \n" +
		"  Found the cron path was wrong; fixed and tested.\n" +
		"\n" +
		"  Next: add a check.\n" +
		"- Reading (Learning) — 45m\n"
	if got := j.Days[0].Markdown; got != want {
		t.Errorf("markdown:\n%s\nwant:\n%s", got, want)
	}
	if strings.Contains(j.Days[0].Markdown, tk.Key) {
		t.Errorf("the task key %s is in the Markdown", tk.Key)
	}
	if j.Days[0].Hours != 2.25 || j.Days[0].Points != 42 {
		t.Errorf("totals = %v h, %v points", j.Days[0].Hours, j.Days[0].Points)
	}
	first := j.Days[0].Sessions[0]
	if first.Start == nil || *first.Start != "09:00" || *first.End != "10:30" || first.What != "Fix backup script" || *first.Area != "Home" {
		t.Errorf("first session = %+v", first)
	}
	if j.Days[0].Sessions[1].Start != nil {
		t.Error("a session with no start time got one")
	}
}

// Newest day first, days without sessions left out, timed sessions first in
// time order and the rest in the order logged, a task's title even after the
// task is deleted, and a session with neither task nor label still has a name.
func TestJournalOrderAndOmissions(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HOM")
	tk := mustTask(t, d, a.ID, "Old job")
	logSession(t, d, `{"kind":"event","label":"untimed first","hours":1,"energy_type_id":1,"logged_for":"2026-11-10"}`)
	logSession(t, d, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-11-10","started_at":"2026-11-10T15:00:00Z"}`, tk.ID))
	logSession(t, d, `{"kind":"event","label":"morning","hours":1,"energy_type_id":1,"logged_for":"2026-11-10","started_at":"2026-11-10T06:00:00Z"}`)
	logSession(t, d, `{"kind":"event","hours":1,"energy_type_id":1,"logged_for":"2026-11-10"}`)
	logSession(t, d, `{"kind":"event","label":"later day","hours":1,"energy_type_id":1,"logged_for":"2026-11-12"}`)
	gone := logSession(t, d, `{"kind":"event","label":"deleted","hours":1,"energy_type_id":1,"logged_for":"2026-11-11"}`)
	if err := d.DeleteSession(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteTask(ctx, tk.ID); err != nil {
		t.Fatal(err)
	}

	j, err := d.Journal(ctx, "2026-11-01", "2026-11-30", 0)
	if err != nil {
		t.Fatal(err)
	}
	var days []string
	for _, x := range j.Days {
		days = append(days, x.Day)
	}
	if strings.Join(days, " ") != "2026-11-12 2026-11-10" {
		t.Fatalf("days = %v (empty and deleted-only days must be left out, newest first)", days)
	}
	var names []string
	for _, s := range j.Days[1].Sessions {
		names = append(names, s.What)
	}
	if got := strings.Join(names, "|"); got != "morning|Old job|untimed first|Event" {
		t.Errorf("order = %s", got)
	}
	if j.More {
		t.Error("more with no limit")
	}
	if none, _ := d.Journal(ctx, "2026-01-01", "2026-01-02", 0); len(none.Days) != 0 || none.Days == nil {
		t.Errorf("an empty range gives %+v, want an empty list", none.Days)
	}
	if _, err := d.Journal(ctx, "2026-11-30", "2026-11-01", 0); err == nil {
		t.Error("dates backwards were accepted")
	}
	if _, err := d.Journal(ctx, "yesterday", "2026-11-01", 0); err == nil {
		t.Error("a word instead of a date was accepted")
	}
}

// A widget lists the newest days only, and says when it cut older ones off.
func TestJournalDayLimit(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	for day := 1; day <= 5; day++ {
		logSession(t, d, fmt.Sprintf(`{"kind":"event","label":"d%d","hours":1,"energy_type_id":1,"logged_for":"2026-11-%02d"}`, day, day))
	}
	j, err := d.Journal(ctx, "2026-11-01", "2026-11-30", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(j.Days) != 3 || j.Days[0].Day != "2026-11-05" || j.Days[2].Day != "2026-11-03" || !j.More {
		t.Errorf("days = %+v more = %v", j.Days, j.More)
	}
	j, _ = d.Journal(ctx, "2026-11-03", "2026-11-30", 3)
	if len(j.Days) != 3 || j.More {
		t.Errorf("exactly the limit: %d days, more = %v", len(j.Days), j.More)
	}
}

func TestJournalNumbers(t *testing.T) {
	for h, want := range map[float64]string{0: "0m", 0.75: "45m", 2: "2h", 6.5: "6h 30m", 1.0 / 3: "20m", 23.999: "24h"} {
		if got := hoursText(h); got != want {
			t.Errorf("hoursText(%v) = %s, want %s", h, got, want)
		}
	}
	for p, want := range map[float64]string{0: "0 points", 1: "1 point", 42: "42 points", 12.5: "12.5 points", 0.1 + 0.2: "0.3 points", 7.999: "8 points"} {
		if got := pointsText(p); got != want {
			t.Errorf("pointsText(%v) = %s, want %s", p, got, want)
		}
	}
	if s := cleanNote(" \r\n \n"); s != nil {
		t.Errorf("a blank note became %q", *s)
	}
}

// A journal widget saves only its range, its viz is always "journal", and no
// metric, board or app data can pass for one.
func TestJournalWidget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, _ := d.ListDashboards(ctx)
	dash := itoa(all[0].ID)
	f := func(s string) Fields { return fields(t, s) }

	w, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"journal","title":"What I did","query":{"range":"7d"},"w":6,"h":8}`))
	if err != nil {
		t.Fatal(err)
	}
	if w.Source != SourceJournal || w.Viz != VizJournal {
		t.Fatalf("saved %+v", w)
	}
	for _, rng := range JournalRanges {
		if _, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"journal","query":{"range":"`+rng+`"}}`)); err != nil {
			t.Errorf("range %s: %v", rng, err)
		}
	}
	if _, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"journal","query":{}}`)); err != nil {
		t.Errorf("no range (means 7 days): %v", err)
	}
	for _, bad := range []string{
		`{"dashboard_id":` + dash + `,"source":"journal","query":{"range":"all"}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","query":{"range":"1y"}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","query":{"range":7}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","query":{"range":"7d","filters":{"area":[1]}}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","viz":"bar","query":{"range":"7d"}}`,
		`{"dashboard_id":` + dash + `,"viz":"journal","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"journal","query":{"app":"habits","widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"source":"view","viz":"journal","query":{"view_id":1}}`,
	} {
		if _, err := d.CreateWidget(ctx, f(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	// A change is checked against the widget's own source.
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"title":"Other","x":2,"query":{"range":"30d"}}`)); err != nil {
		t.Errorf("edit: %v", err)
	}
	for _, bad := range []string{`{"query":{"metric":"points"}}`, `{"viz":"number"}`, `{"source":"metric","viz":"number","query":{"metric":"points"}}`} {
		if _, err := d.PatchWidget(ctx, w.ID, f(bad)); err == nil {
			t.Errorf("patched with %s", bad)
		}
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("a journal widget ran as a metric")
	}

	// Only a journal widget can be run as one; the dashboard's dates replace its range.
	if _, err := d.JournalForWidget(ctx, 99999, "", ""); err == nil {
		t.Error("a widget that does not exist ran")
	}
	other, _ := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"viz":"number","query":{"metric":"points","range":"7d"}}`))
	if _, err := d.JournalForWidget(ctx, other.ID, "", ""); err == nil {
		t.Error("a metric widget ran as a journal")
	}
	logSession(t, d, `{"kind":"event","label":"long ago","hours":1,"energy_type_id":1,"logged_for":"2020-03-02"}`)
	j, err := d.JournalForWidget(ctx, w.ID, "2020-03-01", "2020-03-31")
	if err != nil || len(j.Days) != 1 || j.From != "2020-03-01" {
		t.Errorf("over the dashboard's dates: %v %+v", err, j)
	}
	if _, err := d.JournalForWidget(ctx, w.ID, "2020-03-01", ""); err == nil {
		t.Error("half a date pair was accepted")
	}
	j, err = d.JournalForWidget(ctx, w.ID, "", "")
	if err != nil || len(j.Days) != 0 || j.To != d.Now(ctx).Format(dateFmt) {
		t.Errorf("its own range (30 days to today): %v %+v", err, j)
	}
}

// A journal widget carries no ids, so it reaches the other device as it is.
func TestSyncAJournalWidgetIsUnchanged(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	w, err := srv.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"source":"journal","query":{"range":"30d"}}`))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	var uid string
	if err := srv.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = 'widget' AND id = ?`, w.ID).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	pw, ok := idOf(ctx, phone, "widget", uid)
	if !ok {
		t.Fatal("the widget did not reach the phone")
	}
	var query, source, viz string
	if err := phone.QueryRowContext(ctx, `SELECT query, source, viz FROM widget WHERE id = ?`, pw).Scan(&query, &source, &viz); err != nil {
		t.Fatal(err)
	}
	if strings.ReplaceAll(query, " ", "") != `{"range":"30d"}` || source != SourceJournal || viz != VizJournal {
		t.Errorf("the phone's widget is %s %s %s", source, viz, query)
	}
}
