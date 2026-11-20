package db

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
)

func mustCreate(t *testing.T, d *DB, js string) *Task {
	t.Helper()
	tk, err := d.CreateTask(context.Background(), fields(t, js))
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

func TestContinueMakesTheNextTaskAndAnEpicForBoth(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HOM")
	src := mustCreate(t, d, fmt.Sprintf(`{"title":"Set up NVR","area_id":%d,"priority_id":3,"difficulty":4,"energy_type_id":2,"estimate_h":2,"tags":["cctv"]}`, a.ID))

	next, err := d.ContinueTask(ctx, src.ID, ContinueInput{Title: "Wire garage camera", Epic: "new", EpicTitle: "NVR cameras"})
	if err != nil {
		t.Fatal(err)
	}
	if next.FollowsID == nil || *next.FollowsID != src.ID || next.Follows == nil || next.Follows.Key != src.Key {
		t.Errorf("follows = %v / %+v", next.FollowsID, next.Follows)
	}
	if next.Behaviour != "todo" || next.AreaID != a.ID || *next.PriorityID != 3 || *next.Difficulty != 4 || *next.EnergyTypeID != 2 {
		t.Errorf("copied wrong: %+v", next)
	}
	if next.EstimateH != nil {
		t.Errorf("estimate copied: %v", *next.EstimateH)
	}
	if len(next.TagIDs) != 1 {
		t.Errorf("tags = %v", next.TagIDs)
	}
	old, _ := d.GetTask(ctx, src.ID)
	if next.EpicID == nil || old.EpicID == nil || *next.EpicID != *old.EpicID {
		t.Fatalf("not both in one epic: %v %v", next.EpicID, old.EpicID)
	}
	epic, _ := d.GetTask(ctx, *next.EpicID)
	if epic.Type != "epic" || epic.Title != "NVR cameras" || *epic.EpicTasks != 2 {
		t.Errorf("epic = %+v", epic)
	}
	if len(old.FollowedBy) != 1 || old.FollowedBy[0].ID != next.ID {
		t.Errorf("followed_by = %+v", old.FollowedBy)
	}

	// A second "new" epic with the same title (other capitals) reuses it.
	other := mustTask(t, d, a.ID, "Buy cables")
	n2, err := d.ContinueTask(ctx, other.ID, ContinueInput{Title: "Run cables", Epic: "new", EpicTitle: "nvr CAMERAS"})
	if err != nil {
		t.Fatal(err)
	}
	if *n2.EpicID != epic.ID {
		t.Errorf("made a second epic instead of reusing %d: %d", epic.ID, *n2.EpicID)
	}
}

func TestContinueEpicChoicesFollowTheEpicRules(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HOM")
	epic := mustCreate(t, d, fmt.Sprintf(`{"title":"Home security","area_id":%d,"type":"epic"}`, a.ID))
	inEpic := mustCreate(t, d, fmt.Sprintf(`{"title":"Set up NVR","area_id":%d,"epic_id":%d}`, a.ID, epic.ID))

	// In an epic: the next task joins it by default; a new epic is refused.
	n, err := d.ContinueTask(ctx, inEpic.ID, ContinueInput{Title: "Next"})
	if err != nil || n.EpicID == nil || *n.EpicID != epic.ID {
		t.Fatalf("default same epic: %v %v", err, n)
	}
	if _, err := d.ContinueTask(ctx, inEpic.ID, ContinueInput{Title: "x", Epic: "new"}); err == nil {
		t.Error("new epic for a task already in one should be refused")
	}
	if n, err := d.ContinueTask(ctx, inEpic.ID, ContinueInput{Title: "Loose", Epic: "none"}); err != nil || n.EpicID != nil {
		t.Errorf("none: %v %v", err, n)
	}

	// No epic: default is none; pick puts both in the chosen epic.
	plain := mustTask(t, d, a.ID, "Plain")
	if n, err := d.ContinueTask(ctx, plain.ID, ContinueInput{Title: "Plain 2"}); err != nil || n.EpicID != nil {
		t.Errorf("default none: %v %v", err, n)
	}
	if n, err := d.ContinueTask(ctx, plain.ID, ContinueInput{Title: "Plain 3", Epic: "pick", EpicID: &epic.ID}); err != nil || *n.EpicID != epic.ID {
		t.Fatalf("pick: %v %v", err, n)
	}
	if p, _ := d.GetTask(ctx, plain.ID); p.EpicID == nil || *p.EpicID != epic.ID {
		t.Error("pick did not put the old task in the epic too")
	}
	notEpic := mustTask(t, d, a.ID, "Not an epic")
	other := mustTask(t, d, a.ID, "Other")
	if _, err := d.ContinueTask(ctx, other.ID, ContinueInput{Title: "x", Epic: "pick", EpicID: &notEpic.ID}); err == nil {
		t.Error("picking a task that is not an epic should be refused")
	}
	if o, _ := d.GetTask(ctx, other.ID); o.EpicID != nil || len(o.FollowedBy) != 0 {
		t.Error("a refused continue changed the old task")
	}

	// An epic continues as an epic, with no epic of its own.
	ne, err := d.ContinueTask(ctx, epic.ID, ContinueInput{Title: "Home security, phase 2"})
	if err != nil || ne.Type != "epic" || ne.EpicID != nil || *ne.FollowsID != epic.ID {
		t.Errorf("epic continue: %v %+v", err, ne)
	}
	if _, err := d.ContinueTask(ctx, epic.ID, ContinueInput{Title: "x", Epic: "new"}); err == nil {
		t.Error("an epic's next one cannot be put in an epic")
	}

	// A subtask: the next subtask of the same parent, or a task of its own.
	parent := mustTask(t, d, a.ID, "Install cameras")
	sub := mustCreate(t, d, fmt.Sprintf(`{"title":"Front camera","parent_id":%d}`, parent.ID))
	ns, err := d.ContinueTask(ctx, sub.ID, ContinueInput{Title: "Back camera"})
	if err != nil || ns.ParentID == nil || *ns.ParentID != parent.ID {
		t.Errorf("next subtask: %v %+v", err, ns)
	}
	sep, err := d.ContinueTask(ctx, sub.ID, ContinueInput{Title: "Separate", Separate: true})
	if err != nil || sep.ParentID != nil {
		t.Errorf("separate: %v %+v", err, sep)
	}

	// Copy can leave things out; a title is needed.
	src := mustCreate(t, d, fmt.Sprintf(`{"title":"Tagged","area_id":%d,"priority_id":3,"difficulty":5,"tags":["x"]}`, a.ID))
	nc, err := d.ContinueTask(ctx, src.ID, ContinueInput{Title: "Untagged", Copy: []string{"priority"}})
	if err != nil || len(nc.TagIDs) != 0 || nc.Difficulty != nil || *nc.PriorityID != 3 {
		t.Errorf("copy subset: %v %+v", err, nc)
	}
	if _, err := d.ContinueTask(ctx, src.ID, ContinueInput{Title: "  "}); err == nil {
		t.Error("an empty title should be refused")
	}
	if _, err := d.ContinueTask(ctx, src.ID, ContinueInput{Title: "x", Copy: []string{"estimate"}}); err == nil {
		t.Error("an unknown copy field should be refused")
	}
}

func TestRoundsNumberTheSameTaskAndNeverRenumber(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Home", "HOM")
	src := mustCreate(t, d, fmt.Sprintf(`{"title":"Clean home","area_id":%d,"estimate_h":2,"difficulty":2,"description":"kitchen, bath","tags":["chores"]}`, a.ID))

	r2, err := d.NextRound(ctx, src.ID, RoundInput{})
	if err != nil {
		t.Fatal(err)
	}
	r1, _ := d.GetTask(ctx, src.ID)
	if *r1.RoundNo != 1 || *r1.RoundOf != src.ID || *r1.RoundKind != "round" {
		t.Errorf("first becomes round 1: %v %v %v", r1.RoundNo, r1.RoundOf, r1.RoundKind)
	}
	if *r2.RoundNo != 2 || *r2.RoundOf != src.ID || r2.Title != "Clean home" || *r2.EstimateH != 2 ||
		*r2.Difficulty != 2 || *r2.Description != "kitchen, bath" || len(r2.TagIDs) != 1 || r2.Behaviour != "todo" {
		t.Errorf("round 2 = %+v", r2)
	}
	if r2.FollowsID != nil {
		t.Error("a round is not a continuation")
	}
	r3, err := d.NextRound(ctx, r2.ID, RoundInput{Kind: "version"}) // a later round keeps the series' kind
	if err != nil || *r3.RoundNo != 3 || *r3.RoundKind != "round" {
		t.Fatalf("round 3: %v %+v", err, r3)
	}
	if len(r3.Rounds) != 3 || r3.Rounds[0].No != 1 || r3.Rounds[2].ID != r3.ID {
		t.Errorf("rounds = %+v", r3.Rounds)
	}

	// Deleting #2 leaves a gap: #3 stays #3, and the next is #4.
	if err := d.DeleteTask(ctx, r2.ID); err != nil {
		t.Fatal(err)
	}
	r4, err := d.NextRound(ctx, r1.ID, RoundInput{})
	if err != nil || *r4.RoundNo != 4 {
		t.Fatalf("after delete: %v %v", err, r4.RoundNo)
	}
	if got, _ := d.GetTask(ctx, r3.ID); *got.RoundNo != 3 || len(got.Rounds) != 3 {
		t.Errorf("after delete: #%d, %d rounds", *got.RoundNo, len(got.Rounds))
	}

	// The kind is changed for the whole series.
	if _, err := d.SetRoundKind(ctx, r4.ID, "version"); err != nil {
		t.Fatal(err)
	}
	if got, _ := d.GetTask(ctx, r1.ID); *got.RoundKind != "version" {
		t.Error("kind not changed on round 1")
	}
	if _, err := d.SetRoundKind(ctx, r4.ID, "edition"); err == nil {
		t.Error("an unknown kind should be refused")
	}
	if _, err := d.SetRoundKind(ctx, mustTask(t, d, a.ID, "alone").ID, "version"); err == nil {
		t.Error("a task without rounds has no kind to set")
	}

	// Versions from the start, an epic refused, a snoozed next round.
	b := mustTask(t, d, a.ID, "Board layout")
	v2, err := d.NextRound(ctx, b.ID, RoundInput{Kind: "version"})
	if err != nil || *v2.RoundKind != "version" || *v2.RoundNo != 2 {
		t.Errorf("version: %v %+v", err, v2)
	}
	epic := mustCreate(t, d, fmt.Sprintf(`{"title":"E","area_id":%d,"type":"epic"}`, a.ID))
	if _, err := d.NextRound(ctx, epic.ID, RoundInput{}); err == nil {
		t.Error("an epic can't have rounds")
	}
	today := "2026-11-20"
	until := "2026-11-27"
	s, err := d.NextRound(ctx, b.ID, RoundInput{SnoozeUntil: &until, Today: today})
	if err != nil || s.SnoozedUntil == nil || *s.SnoozedUntil != until {
		t.Errorf("snoozed round: %v %+v", err, s)
	}
}

// The new links travel to the phone: "comes after", and round 1, which
// points at itself.
func TestContinueAndRoundsSync(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	a := mustArea(t, srv, "Home", "HOM")
	src := mustTask(t, srv, a.ID, "Set up NVR")
	if _, err := srv.ContinueTask(ctx, src.ID, ContinueInput{Title: "Wire garage camera", Epic: "new"}); err != nil {
		t.Fatal(err)
	}
	clean := mustTask(t, srv, a.ID, "Clean home")
	if _, err := srv.NextRound(ctx, clean.ID, RoundInput{}); err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)

	next := taskByTitle(t, phone, "Wire garage camera")
	if next.Follows == nil || next.Follows.Title != "Set up NVR" || next.EpicID == nil {
		t.Errorf("on the phone: follows %+v epic %v", next.Follows, next.EpicID)
	}
	var ids []int64
	if err := scanInto(ctx, phone, `SELECT id FROM task WHERE title = 'Clean home' ORDER BY round_no`, func(r *sql.Rows) error {
		var id int64
		err := r.Scan(&id)
		ids = append(ids, id)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 {
		t.Fatalf("rounds on the phone: %v", ids)
	}
	one, _ := phone.GetTask(ctx, ids[0])
	if one.RoundOf == nil || *one.RoundOf != one.ID || *one.RoundNo != 1 || len(one.Rounds) != 2 {
		t.Errorf("round 1 on the phone: of %v no %v rounds %d", one.RoundOf, one.RoundNo, len(one.Rounds))
	}
}
