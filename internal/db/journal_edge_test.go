package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func journalDay(t *testing.T, d *DB, day string) JournalDay {
	t.Helper()
	j, err := d.Journal(context.Background(), day, day, 0)
	if err != nil || len(j.Days) != 1 {
		t.Fatalf("journal for %s: %v %+v", day, err, j)
	}
	return j.Days[0]
}

// A day's hours are the same figure the day screen gives, also for a
// session split over two energy types (it is counted once, not twice).
func TestJournalHoursMatchTheDayTotals(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	logSession(t, d, `{"kind":"event","label":"split","hours":2,"logged_for":"2026-11-15","energies":[{"energy_type_id":1,"share":0.5},{"energy_type_id":2,"share":0.5}]}`)
	logSession(t, d, `{"kind":"event","label":"plain","hours":1.25,"energy_type_id":3,"logged_for":"2026-11-15"}`)
	day, err := d.GetDay(ctx, "2026-11-15")
	if err != nil {
		t.Fatal(err)
	}
	sum := 0.0
	for _, x := range day.Totals {
		sum += x.Hours
	}
	if got := journalDay(t, d, "2026-11-15").Hours; got != sum || got != 3.25 {
		t.Errorf("journal says %v h, the day totals add up to %v h, want 3.25", got, sum)
	}
}

// Times are the person's own clock: across midnight, over a daylight-saving
// change, and only when the start belongs to the session's day.
func TestJournalTimes(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	times := func(day string) []string {
		var out []string
		for _, s := range journalDay(t, d, day).Sessions {
			if s.Start == nil {
				out = append(out, s.What+": none")
			} else {
				out = append(out, s.What+": "+*s.Start+"-"+*s.End)
			}
		}
		return out
	}

	// 18:00 UTC is 23:30 in Kolkata, and two hours later is 01:30 the next day.
	if err := d.PutSetting(ctx, "time_zone", []byte(`"Asia/Kolkata"`)); err != nil {
		t.Fatal(err)
	}
	logSession(t, d, `{"kind":"event","label":"late","hours":2,"energy_type_id":1,"logged_for":"2026-11-15","started_at":"2026-11-15T18:00:00Z"}`)
	if got := strings.Join(times("2026-11-15"), "|"); got != "late: 23:30-01:30" {
		t.Errorf("across midnight: %s", got)
	}

	// New York, the night the clocks go forward (8 March 2026, 02:00 becomes
	// 03:00): 01:30 plus 90 real minutes is 04:00 on the wall clock.
	if err := d.PutSetting(ctx, "time_zone", []byte(`"America/New_York"`)); err != nil {
		t.Fatal(err)
	}
	logSession(t, d, `{"kind":"event","label":"dst","hours":1.5,"energy_type_id":1,"logged_for":"2026-03-08","started_at":"2026-03-08T06:30:00Z"}`)
	if got := strings.Join(times("2026-03-08"), "|"); got != "dst: 01:30-04:00" {
		t.Errorf("over the clock change: %s", got)
	}

	// A start time from a long-ago date says nothing about this day: no times.
	// One from the day before (a session logged for the next morning) is kept.
	logSession(t, d, `{"kind":"event","label":"old start","hours":1,"energy_type_id":1,"logged_for":"2026-03-12","started_at":"2026-03-01T15:00:00Z"}`)
	logSession(t, d, `{"kind":"event","label":"day before","hours":1,"energy_type_id":1,"logged_for":"2026-03-12","started_at":"2026-03-11T23:30:00Z"}`)
	logSession(t, d, `{"kind":"event","label":"same day","hours":1,"energy_type_id":1,"logged_for":"2026-03-12","started_at":"2026-03-12T14:00:00Z"}`)
	// Order: those with times, by time (the 11th's 19:30 first), then the rest.
	if got := strings.Join(times("2026-03-12"), "|"); got != "day before: 19:30-20:30|same day: 10:00-11:00|old start: none" {
		t.Errorf("start from another date: %s", got)
	}
}

// A task's title is the session's name even when the session has its own
// description; the key never appears.
func TestJournalTaskTitleWins(t *testing.T) {
	d := openTest(t)
	a := mustArea(t, d, "Home", "HOM")
	tk := mustTask(t, d, a.ID, "The task title")
	logSession(t, d, fmt.Sprintf(`{"task_id":%d,"label":"my own words","hours":1,"logged_for":"2026-11-15"}`, tk.ID))
	day := journalDay(t, d, "2026-11-15")
	if day.Sessions[0].What != "The task title" || strings.Contains(day.Markdown, "my own words") || strings.Contains(day.Markdown, tk.Key) {
		t.Errorf("%+v\n%s", day.Sessions[0], day.Markdown)
	}
}

// What a person types never changes the structure of the Markdown around it.
func TestJournalMarkdownSyntaxInText(t *testing.T) {
	d := openTest(t)
	for _, name := range []string{"# Big", "> quote", "- item", "+ plus", "* star", "[ ] box", "1. first", "2) second", "10. tenth", "plain 1. fine"} {
		logSession(t, d, fmt.Sprintf(`{"kind":"event","label":%q,"hours":1,"energy_type_id":1,"logged_for":"2026-11-15"}`, name))
	}
	logSession(t, d, `{"kind":"event","label":"# timed stays","hours":1,"energy_type_id":1,"logged_for":"2026-11-15","started_at":"2026-11-15T09:00:00Z"}`)
	logSession(t, d, `{"kind":"event","label":"noted","hours":1,"energy_type_id":1,"logged_for":"2026-11-15","note":"first line\n---\nthird\n===\n- a list\n\nafter a gap\nlast"}`)
	md := journalDay(t, d, "2026-11-15").Markdown
	for _, want := range []string{
		"- \\# Big — 1h\n", "- \\> quote — 1h\n", "- \\- item — 1h\n", "- \\+ plus — 1h\n", "- \\* star — 1h\n",
		"- \\[ ] box — 1h\n", "- 1\\. first — 1h\n", "- 2\\) second — 1h\n", "- 10\\. tenth — 1h\n", "- plain 1. fine — 1h\n",
		"· # timed stays — 1h\n", // after the times it cannot start a block
		// Each note line stays on its own line; a rule-like line is escaped; a blank line is left alone.
		"- noted — 1h  \n  first line  \n  \\---  \n  third  \n  \\===  \n  - a list\n\n  after a gap  \n  last\n",
	} {
		if !strings.Contains(md, want) {
			t.Errorf("missing %q in\n%s", want, md)
		}
	}
}

// A very wide span holds the newest 366 days with sessions and says there are more.
func TestJournalSpanIsCapped(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	day := parseDay("2024-01-01")
	for i := 0; i < JournalMaxDays+2; i++ {
		logSession(t, d, fmt.Sprintf(`{"kind":"event","label":"x","hours":1,"energy_type_id":1,"logged_for":%q}`, day.AddDate(0, 0, i).Format(dateFmt)))
	}
	j, err := d.Journal(ctx, "2000-01-01", "2099-12-31", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(j.Days) != JournalMaxDays || !j.More || j.Days[len(j.Days)-1].Day != day.AddDate(0, 0, 2).Format(dateFmt) {
		t.Errorf("%d days, more = %v, oldest %s", len(j.Days), j.More, j.Days[len(j.Days)-1].Day)
	}
	if j, _ = d.Journal(ctx, "2000-01-01", "2099-12-31", 5000); len(j.Days) != JournalMaxDays {
		t.Errorf("a larger limit gave %d days", len(j.Days))
	}
}
