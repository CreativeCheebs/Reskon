package db

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestSessionFilters(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "Order NVR drive")
	d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-10-01","note":"flashed"}`, tk.ID)))
	d.CreateSession(ctx, fields(t, `{"kind":"event","label":"Gaming","hours":2,"logged_for":"2026-10-02","energy_type_id":5}`))
	d.CreateSession(ctx, fields(t, `{"label":"Paperwork","hours":1,"logged_for":"2026-10-03","energy_type_id":3}`))
	st, _ := d.CreateSubtype(ctx, fields(t, `{"name":"paperwork","energy_type_id":3}`))
	d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"label":"Tax","hours":1,"logged_for":"2026-10-04","energy_type_id":3,"difficulty":3,"subtypes":[%d]}`, st.ID)))
	yes, no := true, false
	cases := []struct {
		q    SessionQuery
		want int
	}{
		{SessionQuery{}, 4},
		{SessionQuery{Kind: "event"}, 1},
		{SessionQuery{EnergyTypes: []int64{3, 5}}, 3},
		{SessionQuery{Areas: []int64{a.ID}}, 1},
		{SessionQuery{HasTask: &yes}, 1},
		{SessionQuery{HasTask: &no}, 3},
		{SessionQuery{Search: "nvr"}, 1},      // task title
		{SessionQuery{Search: "flashed"}, 1},  // note
		{SessionQuery{Search: "gam"}, 1},      // label
		{SessionQuery{Search: "PER-1"}, 1},    // task key
		{SessionQuery{From: "2026-10-02"}, 3}, // date range still works
		{SessionQuery{HasDiff: &yes}, 1},
		{SessionQuery{HasDiff: &no}, 3},
		{SessionQuery{HasSubtypes: &yes}, 1},
		{SessionQuery{HasSubtypes: &no}, 3},
		{SessionQuery{Kind: "event", HasDiff: &no}, 1}, // combines with kind
	}
	for _, c := range cases {
		got, err := d.ListSessions(ctx, c.q)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != c.want {
			t.Errorf("%+v: %d sessions, want %d", c.q, len(got), c.want)
		}
	}
}

func TestBulkSessions(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	other := mustArea(t, d, "Main job", "OM2")
	tk := mustTask(t, d, other.ID, "stm32 demo")
	var ids []int64
	for i := 0; i < 3; i++ {
		s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"task_id":%d,"hours":1,"logged_for":"2026-10-0%d"}`, tk.ID, i+1)))
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, s.ID)
	}
	loose, _ := d.CreateSession(ctx, fields(t, `{"label":"walk","hours":1,"logged_for":"2026-10-05","energy_type_id":2}`))

	// Set several fields on two sessions at once.
	n, err := d.BulkSessions(ctx, ids[:2], fields(t, `{"energy_type_id":3,"kind":"event","difficulty":4,"logged_for":"2026-09-30"}`), false, nil)
	if err != nil || n != 2 {
		t.Fatalf("bulk set: %d %v", n, err)
	}
	s0, _ := d.GetSession(ctx, ids[0])
	s2, _ := d.GetSession(ctx, ids[2])
	if s0.EnergyTypeID != 3 || s0.Kind != "event" || *s0.Difficulty != 4 || s0.LoggedFor != "2026-09-30" {
		t.Errorf("not applied: %+v", s0)
	}
	if s2.EnergyTypeID == 3 {
		t.Error("unselected session changed")
	}

	// Detach keeps the task title as the label.
	if _, err := d.BulkSessions(ctx, ids[:1], Fields{"task_id": json.RawMessage("null")}, false, nil); err != nil {
		t.Fatal(err)
	}
	s0, _ = d.GetSession(ctx, ids[0])
	if s0.TaskID != nil || s0.Label == nil || *s0.Label != "stm32 demo" {
		t.Errorf("detach: task %v label %v", s0.TaskID, s0.Label)
	}

	// Attach takes the task's area.
	if _, err := d.BulkSessions(ctx, []int64{loose.ID}, fields(t, fmt.Sprintf(`{"task_id":%d}`, tk.ID)), false, nil); err != nil {
		t.Fatal(err)
	}
	l, _ := d.GetSession(ctx, loose.ID)
	if l.TaskID == nil || *l.TaskID != tk.ID || l.AreaID == nil || *l.AreaID != other.ID {
		t.Errorf("attach: %+v", l)
	}
	_ = a

	// Bad values and missing ids change nothing.
	if _, err := d.BulkSessions(ctx, ids, fields(t, `{"difficulty":9}`), false, nil); err == nil {
		t.Error("difficulty 9 accepted")
	}
	if _, err := d.BulkSessions(ctx, ids, fields(t, `{"hours":3}`), false, nil); err == nil {
		t.Error("hours is not a bulk field but was accepted")
	}
	if _, err := d.BulkSessions(ctx, append(ids, 9999), fields(t, `{"kind":"task"}`), false, nil); err == nil {
		t.Error("missing id accepted")
	}
	if s, _ := d.GetSession(ctx, ids[2]); s.Kind != "task" || s.EnergyTypeID == 3 {
		t.Error("a refused bulk change still changed something")
	}

	// Delete many.
	n, err = d.BulkSessions(ctx, ids, nil, true, nil)
	if err != nil || n != 3 {
		t.Fatalf("bulk delete: %d %v", n, err)
	}
	left, _ := d.ListSessions(ctx, SessionQuery{})
	if len(left) != 1 {
		t.Errorf("%d sessions left, want 1", len(left))
	}
	if _, err := d.BulkSessions(ctx, ids, nil, true, nil); err == nil {
		t.Error("deleting already-deleted sessions accepted")
	}
}

func TestBulkAddTags(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	var ids []int64
	for i := 0; i < 3; i++ {
		s, err := d.CreateSession(ctx, fields(t, fmt.Sprintf(`{"label":"s%d","hours":1,"logged_for":"2026-10-0%d","energy_type_id":2}`, i, i+1)))
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, s.ID)
	}
	if _, err := d.PatchSession(ctx, ids[0], fields(t, `{"tags":["alpha"]}`)); err != nil {
		t.Fatal(err)
	}
	names := func(id int64) map[string]int {
		s, err := d.GetSession(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]int{}
		for _, g := range s.Tags {
			var name string
			if err := d.QueryRowContext(ctx, `SELECT name FROM tag WHERE id = ?`, g.TagID).Scan(&name); err != nil {
				t.Fatal(err)
			}
			out[name]++
		}
		return out
	}

	// Adds to several sessions, keeps what they had, creates the new tag.
	n, err := d.BulkSessions(ctx, ids[:2], nil, false, []string{"alpha", "brand-new"})
	if err != nil || n != 2 {
		t.Fatalf("add tags: %d %v", n, err)
	}
	for i, id := range ids[:2] {
		if g := names(id); g["alpha"] != 1 || g["brand-new"] != 1 {
			t.Errorf("session %d tags %v", i, g)
		}
	}
	if len(names(ids[2])) != 0 {
		t.Error("unselected session got tags")
	}
	// Adding again is harmless.
	if _, err := d.BulkSessions(ctx, ids, nil, false, []string{"Alpha"}); err != nil {
		t.Fatal(err)
	}
	if g := names(ids[0]); g["alpha"] != 1 || g["brand-new"] != 1 || len(g) != 2 {
		t.Errorf("re-add changed tags: %v", g)
	}
	// A missing id changes nothing.
	if _, err := d.BulkSessions(ctx, append(ids, 9999), nil, false, []string{"ghost"}); err == nil {
		t.Error("missing id accepted")
	}
	var c int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM tag WHERE name = 'ghost'`).Scan(&c)
	if c != 0 || len(names(ids[2])) != 1 {
		t.Error("a refused bulk add still changed something")
	}
	// Exclusive with set and delete; blank names refused.
	if _, err := d.BulkSessions(ctx, ids, fields(t, `{"kind":"task"}`), false, []string{"x"}); err == nil {
		t.Error("add_tags with set accepted")
	}
	if _, err := d.BulkSessions(ctx, ids, nil, true, []string{"x"}); err == nil {
		t.Error("add_tags with delete accepted")
	}
	if _, err := d.BulkSessions(ctx, ids, nil, false, []string{" ", ""}); err == nil {
		t.Error("blank tag names accepted")
	}
}

func TestBulkAddTagsLimits(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	s, err := d.CreateSession(ctx, fields(t, `{"label":"a","hours":1,"logged_for":"2026-10-01","energy_type_id":2}`))
	if err != nil {
		t.Fatal(err)
	}
	count := func() int {
		var c int
		d.QueryRowContext(ctx, `SELECT COUNT(*) FROM session_tag WHERE session_id = ?`, s.ID).Scan(&c)
		return c
	}
	var many []string
	for i := 0; i < 21; i++ {
		many = append(many, fmt.Sprintf("t%d", i))
	}
	for name, tags := range map[string][]string{
		"hash only":     {"#"},
		"comma":         {"a,b"},
		"too long":      {strings.Repeat("x", 33)},
		"too many":      many,
		"hash-only mix": {"ok", "#"},
	} {
		if _, err := d.BulkSessions(ctx, []int64{s.ID}, nil, false, tags); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
	// "#x" is cleaned to "x", not refused.
	if _, err := d.BulkSessions(ctx, []int64{s.ID}, nil, false, []string{"#x", "X"}); err != nil || count() != 1 {
		t.Fatalf("#x: %v, %d tags", err, count())
	}
	var c int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM tag WHERE name IN ('ok','a','b')`).Scan(&c)
	if c != 0 {
		t.Error("a refused add created tags")
	}
	// A session already at 20 tags refuses one more, and nothing changes.
	if _, err := d.PatchSession(ctx, s.ID, fields(t, fmt.Sprintf(`{"tags":%s}`, mustJSON(many[:20])))); err != nil {
		t.Fatal(err)
	}
	if _, err := d.BulkSessions(ctx, []int64{s.ID}, nil, false, []string{"one-more"}); err == nil {
		t.Error("21st tag accepted")
	}
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM tag WHERE name = 'one-more'`).Scan(&c)
	if count() != 20 || c != 0 {
		t.Errorf("refused add changed things: %d tags, new tag rows %d", count(), c)
	}
}
