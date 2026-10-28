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
	d.PatchTask(ctx, a.ID, fields(t, fmt.Sprintf(`{"difficulty":8,"updated_at":%q,"custom":{"escalated":true}}`, a.UpdatedAt)))
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
		got, err := d.ListTasksForView(ctx, viewWith(t, d, tc.filter))
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
