package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func tagNames(t *testing.T, d *DB) []string {
	t.Helper()
	tags, err := d.ListTags(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, g := range tags {
		out = append(out, g.Name)
	}
	return out
}

func tagID(t *testing.T, d *DB, name string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRowContext(context.Background(), `SELECT id FROM tag WHERE name = ? COLLATE NOCASE`, name).Scan(&id); err != nil {
		t.Fatalf("no tag %q: %v", name, err)
	}
	return id
}

func tagsOf(t *testing.T, d *DB, ids []int64) []string {
	t.Helper()
	var out []string
	for _, id := range ids {
		var n string
		if err := d.QueryRowContext(context.Background(), `SELECT name FROM tag WHERE id = ?`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		out = append(out, n)
	}
	return out
}

func TestTagNamesAreCleanedAndUniqueIgnoringCase(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a, err := d.CreateTag(ctx, "  #Back   end ")
	if err != nil {
		t.Fatal(err)
	}
	if a.Name != "Back end" {
		t.Errorf("name = %q, want it trimmed, without the # and with single spaces", a.Name)
	}
	b, err := d.CreateTag(ctx, "back END")
	if err != nil || b.ID != a.ID {
		t.Errorf("the same name in other capitals made another tag: %+v, %v", b, err)
	}
	for _, bad := range []string{"", "   ", "#", "a,b", "a\x01b", "a​b", strings.Repeat("x", 33)} {
		if _, err := d.CreateTag(ctx, bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	if _, err := d.CreateTag(ctx, strings.Repeat("x", 32)); err != nil {
		t.Errorf("32 characters refused: %v", err)
	}
	c, _ := d.CreateTag(ctx, "other")
	if _, err := d.RenameTag(ctx, c.ID, "BACK end"); err == nil {
		t.Error("a rename onto another tag's name was accepted")
	}
	if r, err := d.RenameTag(ctx, c.ID, "later"); err != nil || r.Name != "later" {
		t.Errorf("rename = %+v, %v", r, err)
	}
}

func TestTaskTagsAreSetAndReplaced(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	task, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"t","area_id":%d,"tags":["backend","Q4","backend"]}`, a.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if got := tagsOf(t, d, task.TagIDs); strings.Join(got, ",") != "backend,Q4" {
		t.Errorf("tags = %v, want backend and Q4 once each, by name", got)
	}
	// A patch without tags leaves them; one with tags replaces them.
	task, err = d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"title":"t2","updated_at":%q}`, task.UpdatedAt)))
	if err != nil || len(task.TagIDs) != 2 {
		t.Fatalf("a patch without tags changed them: %+v, %v", task.TagIDs, err)
	}
	task, err = d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":["Q4","ui"],"updated_at":%q}`, task.UpdatedAt)))
	if err != nil {
		t.Fatal(err)
	}
	if got := tagsOf(t, d, task.TagIDs); strings.Join(got, ",") != "Q4,ui" {
		t.Errorf("after replacing: %v", got)
	}
	task, err = d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":[],"updated_at":%q}`, task.UpdatedAt)))
	if err != nil || len(task.TagIDs) != 0 {
		t.Errorf("tags not cleared: %+v, %v", task.TagIDs, err)
	}
	if _, err := d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":"x","updated_at":%q}`, task.UpdatedAt))); err == nil {
		t.Error("tags that are not a list were accepted")
	}
	// The tags stay on the list for next time.
	if got := tagNames(t, d); len(got) != 3 {
		t.Errorf("tag list = %v, want backend, Q4, ui", got)
	}
}

func TestASessionShowsItsTasksTagsAsTheyAreNowPlusItsOwn(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	task, _ := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"t","area_id":%d,"tags":["backend"]}`, a.ID)))
	s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","tags":["urgent"]}`, task.ID)))
	if err != nil {
		t.Fatal(err)
	}
	show := func(s *Session) string {
		var out []string
		for _, g := range s.Tags {
			var n string
			d.QueryRowContext(ctx, `SELECT name FROM tag WHERE id = ?`, g.TagID).Scan(&n)
			if g.FromTask {
				n += "(task)"
			}
			out = append(out, n)
		}
		return strings.Join(out, ",")
	}
	if got := show(s); got != "backend(task),urgent" {
		t.Fatalf("session tags = %q", got)
	}

	// Changing the task's tags reaches the session at once; the one put on by hand stays.
	task, _ = d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":["ui"],"updated_at":%q}`, task.UpdatedAt)))
	s, _ = d.GetSession(ctx, s.ID)
	if got := show(s); got != "ui(task),urgent" {
		t.Errorf("after the task's tags changed: %q", got)
	}

	// A tag put on by hand that the task also has is shown as the task's, and stays if the task loses it.
	s, err = d.PatchSession(ctx, s.ID, fields(t, `{"tags":["urgent","ui"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got := show(s); got != "ui(task),urgent" {
		t.Errorf("a tag both ways: %q", got)
	}
	d.PatchTask(ctx, task.ID, fields(t, fmt.Sprintf(`{"tags":[],"updated_at":%q}`, mustTaskUpdatedAt(t, d, task.ID))))
	s, _ = d.GetSession(ctx, s.ID)
	if got := show(s); got != "ui,urgent" {
		t.Errorf("after the task lost its tags: %q (the one put on by hand must stay)", got)
	}

	// Detached from its task, a session keeps only its own.
	s, err = d.PatchSession(ctx, s.ID, fields(t, `{"task_id":null,"tags":["urgent"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got := show(s); got != "urgent" {
		t.Errorf("without a task: %q", got)
	}

	// The list of sessions carries the same.
	list, err := d.ListSessions(ctx, SessionQuery{})
	if err != nil || len(list) != 1 || show(list[0]) != "urgent" {
		t.Errorf("list = %v, %v", list, err)
	}
}

func mustTaskUpdatedAt(t *testing.T, d *DB, id int64) string {
	t.Helper()
	tk, err := d.GetTask(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return tk.UpdatedAt
}

func TestDeletingATagTakesItOffEverythingAndCountsAreRight(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	task, _ := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"t","area_id":%d,"tags":["backend"]}`, a.ID)))
	if _, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04"}`, task.ID))); err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateSession(ctx, fields(t, `{"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","kind":"event","tags":["backend"]}`)); err != nil {
		t.Fatal(err)
	}
	tags, _ := d.ListTags(ctx)
	if len(tags) != 1 || tags[0].Tasks != 1 || tags[0].Sessions != 2 {
		t.Fatalf("counts = %+v, want 1 task and 2 sessions", tags)
	}
	if err := d.DeleteTag(ctx, tags[0].ID); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetTask(ctx, task.ID)
	if len(got.TagIDs) != 0 {
		t.Errorf("task still has %v", got.TagIDs)
	}
	var n int
	d.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM task_tag) + (SELECT COUNT(*) FROM session_tag)`).Scan(&n)
	if n != 0 {
		t.Errorf("%d links left", n)
	}
	if err := d.DeleteTag(ctx, tags[0].ID); err != ErrNotFound {
		t.Errorf("deleting again gave %v", err)
	}
}

func TestFiltersByTag(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	mk := func(title, tags string) *Task {
		tk, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":%q,"area_id":%d,"tags":%s}`, title, a.ID, tags)))
		if err != nil {
			t.Fatal(err)
		}
		return tk
	}
	back := mk("backend job", `["backend"]`)
	mk("ui job", `["ui"]`)
	mk("both", `["backend","ui"]`)
	mk("plain", `[]`)
	backID := tagID(t, d, "backend")
	uiID := tagID(t, d, "ui")

	titles := func(filter string) string {
		v := viewWith(t, d, filter)
		got, err := d.ListTasksForView(ctx, v, "")
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, tk := range got {
			out = append(out, tk.Title)
		}
		return fmt.Sprint(len(out), " ", out)
	}
	if got := titles(fmt.Sprintf(`{"tags":[%d]}`, backID)); !strings.HasPrefix(got, "2 ") {
		t.Errorf("backend: %s", got)
	}
	if got := titles(fmt.Sprintf(`{"tags":[%d,%d]}`, backID, uiID)); !strings.HasPrefix(got, "3 ") {
		t.Errorf("backend or ui: %s", got)
	}
	if got := titles(`{"tags":[0]}`); got != "1 [plain]" {
		t.Errorf("no tags: %s", got)
	}
	if got := titles(fmt.Sprintf(`{"tags":[0,%d]}`, uiID)); !strings.HasPrefix(got, "3 ") {
		t.Errorf("ui or none: %s", got)
	}
	if got := titles(`{"tags":[]}`); !strings.HasPrefix(got, "0 ") {
		t.Errorf("an empty choice matches nothing, like the other filters: %s", got)
	}
	if got := titles(`{}`); !strings.HasPrefix(got, "4 ") {
		t.Errorf("no tag filter: %s", got)
	}

	// Sessions: the task's tag, one put on by hand, or none.
	s1, _ := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"energy_type_id":1,"logged_for":"2026-11-04"}`, back.ID)))
	s2, _ := d.CreateSession(ctx, fields(t, `{"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","kind":"event","tags":["ui"]}`))
	s3, _ := d.CreateSession(ctx, fields(t, `{"hours":1,"energy_type_id":1,"logged_for":"2026-11-04","kind":"event"}`))
	ids := func(q SessionQuery) string {
		got, err := d.ListSessions(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		var out []int64
		for _, s := range got {
			out = append(out, s.ID)
		}
		return fmt.Sprint(out)
	}
	want := func(ss ...*Session) string {
		var out []int64
		for _, s := range ss {
			out = append(out, s.ID)
		}
		return fmt.Sprint(out)
	}
	if got := ids(SessionQuery{Tags: []int64{backID}}); got != want(s1) {
		t.Errorf("sessions with backend (from the task): %s", got)
	}
	if got := ids(SessionQuery{Tags: []int64{uiID}}); got != want(s2) {
		t.Errorf("sessions with ui (put on by hand): %s", got)
	}
	if got := ids(SessionQuery{Tags: []int64{0}}); got != want(s3) {
		t.Errorf("sessions with no tags: %s", got)
	}
}
