package db

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func TestWordScore(t *testing.T) {
	cases := []struct {
		q, title string
		match    bool
	}{
		{"order replacement NVR drive", "Need to order a replacement NVR drive", true},
		{"replacing drives", "Replace the NVR drive", true},        // stems
		{"replacment drive", "Replace the NVR drive", true},        // a typo
		{"set up affin", "Set up self-hosted Affine server", true}, // still typing
		{"birthday party", "Replace the NVR drive", false},
		{"the a to", "Replace the NVR drive", false}, // filler only
	}
	for _, c := range cases {
		s, exact := wordScore(wordsOf(c.q), wordsOf(c.title))
		if got := s >= wordMatchMin && exact; got != c.match {
			t.Errorf("%q vs %q: score %.2f exact %v, want match %v", c.q, c.title, s, exact, c.match)
		}
	}
}

// fakeEmbedder puts texts sharing a "topic" word on the same axis, so the
// test controls what "means the same".
type fakeEmbedder struct{ calls int }

func (f *fakeEmbedder) Embed(text string) []float32 {
	f.calls++
	v := make([]float32, 384)
	switch s := strings.ToLower(text); {
	case strings.Contains(s, "disk") || strings.Contains(s, "drive"):
		v[0] = 1
	case strings.Contains(s, "party"):
		v[1] = 1
	default:
		v[2] = 1
	}
	return v
}

func TestSimilarTasks(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	nvr := mustTask(t, d, a.ID, "Order a replacement NVR drive")
	mustTask(t, d, a.ID, "Plan the party menu")
	other := mustTask(t, d, a.ID, "Buy a new disk for the recorder")

	// Words only, without a model.
	res, err := d.SimilarTasks(ctx, "replacement drive", nil, 6, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Semantic != "off" || len(res.Results) != 1 || res.Results[0].ID != nvr.ID || !res.Results[0].Words {
		t.Fatalf("words only: %+v", res)
	}

	// With a model: the disk task matches by meaning though no word is shared.
	f := &fakeEmbedder{}
	res, err = d.SimilarTasks(ctx, "replacement drive", f, 6, 0)
	if err != nil {
		t.Fatal(err)
	}
	ids := []int64{}
	for _, r := range res.Results {
		ids = append(ids, r.ID)
	}
	if res.Semantic != "ready" || !slices.Equal(ids, []int64{nvr.ID, other.ID}) || !res.Results[1].Meaning || res.Results[1].Words {
		t.Fatalf("with model: %+v", res)
	}
	// Vectors are cached: a second search embeds only the query.
	before := f.calls
	d.SimilarTasks(ctx, "replacement drive", f, 6, 0)
	if f.calls != before+1 {
		t.Errorf("second search embedded %d texts, want 1", f.calls-before)
	}
	// A renamed task is embedded again.
	d.Exec(`UPDATE task SET title = 'Plan the party' WHERE id = ?`, other.ID)
	res, _ = d.SimilarTasks(ctx, "replacement drive", f, 6, 0)
	if len(res.Results) != 1 {
		t.Errorf("after rename: %+v", res.Results)
	}
	// exclude and short queries.
	if res, _ = d.SimilarTasks(ctx, "replacement drive", f, 6, nvr.ID); len(res.Results) != 0 {
		t.Errorf("exclude: %+v", res.Results)
	}
	if res, _ = d.SimilarTasks(ctx, "re", f, 6, 0); len(res.Results) != 0 || res.Semantic != "off" {
		t.Errorf("short query: %+v", res)
	}
}

func TestCompleteness(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	tk := mustTask(t, d, a.ID, "x")
	if len(tk.Missing) != 0 {
		t.Fatalf("no rules, missing %v", tk.Missing)
	}
	if err := d.PutSetting(ctx, "task_completeness", json.RawMessage(`{"required":["start_date","estimate_h","difficulty"]}`)); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetTask(ctx, tk.ID)
	if !slices.Equal(got.Missing, []string{"start_date", "estimate_h", "difficulty"}) {
		t.Errorf("missing %v", got.Missing)
	}
	got, err := d.PatchTask(ctx, tk.ID, Fields{"updated_at": raw(got.UpdatedAt), "estimate_h": raw(2), "difficulty": raw(3)})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got.Missing, []string{"start_date"}) {
		t.Errorf("after patch, missing %v", got.Missing)
	}
	// Done tasks are never incomplete.
	if got, _ = d.Move(ctx, tk.ID, MoveRequest{StatusID: 4}); len(got.Missing) != 0 {
		t.Errorf("done, missing %v", got.Missing)
	}
	if err := d.PutSetting(ctx, "task_completeness", json.RawMessage(`{"required":["colour"]}`)); err == nil {
		t.Error("unknown field accepted")
	}
}

func raw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// A task whose description, not title, has the words is found too.
func TestSimilarSearchesDescriptions(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	tk := mustTask(t, d, mustArea(t, d, "Home", "HM").ID, "Kitchen")
	if _, err := d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"description":"call the plumber about the leaking tap","updated_at":%q}`, tk.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	res, err := d.SimilarTasks(ctx, "leaking tap", nil, 5, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Results) != 1 || !res.Results[0].InDescription {
		t.Fatalf("description match not found: %+v", res.Results)
	}
}
