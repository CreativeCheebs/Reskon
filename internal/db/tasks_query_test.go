package db

import (
	"context"
	"fmt"
	"testing"
)

func viewWith(t *testing.T, d *DB, filter string) int64 {
	t.Helper()
	v, err := d.CreateView(context.Background(), fields(t, fmt.Sprintf(`{"name":"v","layout":"table","filter":%s}`, filter)))
	if err != nil {
		t.Fatal(err)
	}
	return v.ID
}

func titles(tasks []*Task) map[string]bool {
	m := map[string]bool{}
	for _, t := range tasks {
		m[t.Title] = true
	}
	return m
}

func TestViewFilters(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	per := mustArea(t, d, "Personal", "PER")
	om := mustArea(t, d, "Main job", "OM2")
	a := mustTask(t, d, per.ID, "a")
	b := mustTask(t, d, om.ID, "b")
	c := mustTask(t, d, per.ID, "c")
	d.PatchTask(ctx, a.ID, fields(t, fmt.Sprintf(`{"difficulty":5,"updated_at":%q,"custom":{"escalated":true}}`, a.UpdatedAt)))
	d.Move(ctx, c.ID, MoveRequest{StatusID: 4}) // done
	_ = b

	cases := []struct {
		filter string
		want   []string
	}{
		{`{"areas":null}`, []string{"a", "b", "c"}},
		{fmt.Sprintf(`{"areas":[%d]}`, per.ID), []string{"a", "c"}},
		{`{"difficulty_min":4}`, []string{"a"}},
		{`{"custom":{"escalated":true}}`, []string{"a"}},
		{`{"open_only":true}`, []string{"a", "b"}},
		{`{"statuses":[]}`, nil},
		{`{"include_done_days":1}`, []string{"a", "b", "c"}}, // c finished just now
		{`{"include_done_days":0}`, []string{"a", "b"}},
	}
	for _, tc := range cases {
		got, err := d.ListTasksForView(ctx, viewWith(t, d, tc.filter), "")
		if err != nil {
			t.Fatalf("%s: %v", tc.filter, err)
		}
		gt := titles(got)
		if len(gt) != len(tc.want) {
			t.Errorf("%s: got %v, want %v", tc.filter, gt, tc.want)
			continue
		}
		for _, w := range tc.want {
			if !gt[w] {
				t.Errorf("%s: missing %s (got %v)", tc.filter, w, gt)
			}
		}
	}
}

func TestViewFilterRejectsTypos(t *testing.T) {
	d := openTest(t)
	_, err := d.CreateView(context.Background(), fields(t, `{"name":"v","layout":"table","filter":{"area":[1]}}`))
	if _, ok := err.(*InvalidError); !ok {
		t.Errorf("want InvalidError for unknown filter key, got %v", err)
	}
}

func TestCardConfigIsPerView(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	v1, _ := d.CreateView(ctx, fields(t, `{"name":"one","layout":"board"}`))
	v2, _ := d.CreateView(ctx, fields(t, `{"name":"two","layout":"board"}`))
	if _, err := d.PatchView(ctx, v1.ID, fields(t, `{"card_config":{"show":{"area":true}}}`)); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetView(ctx, v2.ID)
	if string(got.CardConfig) != "{}" {
		t.Errorf("view two card_config changed to %s", got.CardConfig)
	}
}

func TestListTaskBriefs(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	open := mustTask(t, d, a.ID, "still open")
	done := mustTask(t, d, a.ID, "finished")
	gone := mustTask(t, d, a.ID, "deleted")
	if _, err := d.Move(ctx, done.ID, MoveRequest{StatusID: 4}); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteTask(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	got, err := d.ListTaskBriefs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != done.ID || got[1].ID != open.ID {
		t.Fatalf("got %+v, want finished then still open (newest first, deleted left out)", got)
	}
	if got[0].Behaviour != "done" || got[1].Behaviour == "done" || got[1].Key != open.Key || got[1].AreaID != a.ID {
		t.Errorf("fields wrong: %+v %+v", got[0], got[1])
	}
}

// "is not": the chosen values are left out; tasks with no value are kept.
func TestViewFilterIsNot(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	per := mustArea(t, d, "Personal", "PER")
	om := mustArea(t, d, "Main job", "OM2")
	a := mustTask(t, d, per.ID, "a")
	b := mustTask(t, d, om.ID, "b")
	c := mustTask(t, d, per.ID, "c")
	e := mustTask(t, d, per.ID, "e")
	epic, err := d.CreateTask(ctx, fields(t, fmt.Sprintf(`{"title":"E","type":"epic","area_id":%d}`, per.ID)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchTask(ctx, a.ID, fields(t, fmt.Sprintf(`{"epic_id":%d,"tags":["x"],"updated_at":%q}`, epic.ID, a.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	d.Move(ctx, c.ID, MoveRequest{StatusID: 4}) // done
	_, _ = b, e
	var tagID int64
	if err := d.QueryRowContext(ctx, `SELECT id FROM tag WHERE name = 'x'`).Scan(&tagID); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		filter string
		want   []string
	}{
		{fmt.Sprintf(`{"areas":[%d],"not":["areas"]}`, per.ID), []string{"b"}},
		{`{"statuses":[4],"not":["statuses"]}`, []string{"a", "b", "e", "E"}},
		{`{"types":["epic"],"not":["types"]}`, []string{"a", "b", "c", "e"}},
		{fmt.Sprintf(`{"epics":[%d],"not":["epics"]}`, epic.ID), []string{"b", "c", "e", "E"}}, // no epic is kept
		{fmt.Sprintf(`{"tags":[%d],"not":["tags"]}`, tagID), []string{"b", "c", "e", "E"}},     // no tags is kept
		{`{"epics":[0],"not":["epics"]}`, []string{"a"}},
		// combined with another filter, and with open_only (both apply)
		{fmt.Sprintf(`{"statuses":[4],"not":["statuses"],"areas":[%d]}`, per.ID), []string{"a", "e", "E"}},
		{`{"statuses":[4],"not":["statuses"],"open_only":true}`, []string{"a", "b", "e", "E"}},
		// an empty "is not" list excludes nothing
		{`{"statuses":[],"not":["statuses"]}`, []string{"a", "b", "c", "e", "E"}},
		// old filters (no "not") behave as before
		{`{"statuses":[4]}`, []string{"c"}},
		{`{"not":[]}`, []string{"a", "b", "c", "e", "E"}},
	}
	for _, tc := range cases {
		got, err := d.ListTasksForView(ctx, viewWith(t, d, tc.filter), "")
		if err != nil {
			t.Fatalf("%s: %v", tc.filter, err)
		}
		gt := titles(got)
		if len(gt) != len(tc.want) {
			t.Errorf("%s: got %v, want %v", tc.filter, gt, tc.want)
			continue
		}
		for _, w := range tc.want {
			if !gt[w] {
				t.Errorf("%s: missing %s (got %v)", tc.filter, w, gt)
			}
		}
	}
	_, err = d.CreateView(ctx, fields(t, `{"name":"v","layout":"table","filter":{"not":["priority"]}}`))
	if _, ok := err.(*InvalidError); !ok {
		t.Errorf("want InvalidError for a bad not entry, got %v", err)
	}
}
