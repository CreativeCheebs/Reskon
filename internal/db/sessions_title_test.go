package db

import (
	"context"
	"fmt"
	"testing"
)

// A session's own title is saved, edited, cleared, searched, and named
// before its task's title and its label (owner request, 2026-11-20).
func TestSessionTitle(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HOM")
	tk := mustTask(t, d, a.ID, "The task title")

	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"title":"Kitchen shelf","label":"drilled and hung it","hours":1,"logged_for":"2026-11-15"}`, tk.ID)))
	if err != nil || s.Title == nil || *s.Title != "Kitchen shelf" || *s.Label != "drilled and hung it" {
		t.Fatalf("create: %+v %v", s, err)
	}
	if got, _ := d.GetSession(ctx, s.ID); got.Title == nil || *got.Title != "Kitchen shelf" {
		t.Errorf("get: %+v", got)
	}

	// The Copy as Markdown name is the session's title, not the task's.
	day := journalDay(t, d, "2026-11-15")
	if day.Sessions[0].What != "Kitchen shelf" {
		t.Errorf("journal what = %q", day.Sessions[0].What)
	}

	// Searchable by a word in the title only.
	if list, err := d.ListSessions(ctx, SessionQuery{From: "2026-11-01", To: "2026-11-30", Search: "shelf"}); err != nil || len(list) != 1 {
		t.Errorf("search by title: %d %v", len(list), err)
	}

	p, err := d.PatchSession(ctx, s.ID, fields(t, `{"title":"Bathroom shelf"}`))
	if err != nil || p.Title == nil || *p.Title != "Bathroom shelf" || *p.Label != "drilled and hung it" {
		t.Fatalf("patch: %+v %v", p, err)
	}
	// The sync triggers, rebuilt from the live columns, mark a title-only edit.
	if n := markCount(d, "session", s.ID, "title"); n != 1 {
		t.Errorf("title edit marked for sync %d times, want 1", n)
	}
	if list, _ := d.ListSessions(ctx, SessionQuery{From: "2026-11-01", To: "2026-11-30", Search: "kitchen"}); len(list) != 0 {
		t.Errorf("old title still found: %d", len(list))
	}

	// Cleared, the task's title names it again.
	if p, err = d.PatchSession(ctx, s.ID, fields(t, `{"title":null}`)); err != nil || p.Title != nil {
		t.Fatalf("clear: %+v %v", p, err)
	}
	if day := journalDay(t, d, "2026-11-15"); day.Sessions[0].What != "The task title" {
		t.Errorf("journal what after clear = %q", day.Sessions[0].What)
	}
}

func TestJournalWhatOrder(t *testing.T) {
	for _, c := range []struct{ own, title, label, kind, want string }{
		{"Mine", "Task", "Desc", "task", "Mine"},
		{"  ", "Task", "Desc", "task", "Task"},
		{"", "", "Desc", "task", "Desc"},
		{"", "", "", "event", "Event"},
		{"", "", "", "task", "Session"},
	} {
		if got := journalWhat(c.own, c.title, c.label, c.kind); got != c.want {
			t.Errorf("journalWhat(%q, %q, %q) = %q, want %q", c.own, c.title, c.label, got, c.want)
		}
	}
}

func TestSessionTitleTrimmed(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	s, err := d.CreateSession(ctx, fields(t, `{"title":"  Plan  ","label":"x","hours":1,"logged_for":"2026-11-15","energy_type_id":2}`))
	if err != nil || s.Title == nil || *s.Title != "Plan" {
		t.Fatalf("create: %+v %v", s, err)
	}
	p, err := d.PatchSession(ctx, s.ID, fields(t, `{"title":"  \t "}`))
	if err != nil || p.Title != nil {
		t.Fatalf("blank patch: %+v %v", p, err)
	}
	p, err = d.PatchSession(ctx, s.ID, fields(t, `{"title":"  Plan  "}`))
	if err != nil || p.Title == nil || *p.Title != "Plan" {
		t.Fatalf("patch: %+v %v", p, err)
	}
	b, err := d.CreateSession(ctx, fields(t, `{"title":" \t ","label":"y","hours":1,"logged_for":"2026-11-15","energy_type_id":2}`))
	if err != nil || b.Title != nil {
		t.Fatalf("blank create: %+v %v", b, err)
	}
}
