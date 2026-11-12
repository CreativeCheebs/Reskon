package capture

import (
	"context"
	"strings"
	"testing"
)

var tagLookups = Lookups{Tags: []string{"backend", "Q4", "ui"}}

// Capture only ever picks tags that exist, in their real spelling; it never makes one up.
func TestNormaliseKeepsOnlyExistingTags(t *testing.T) {
	r := Normalise(Result{Tags: []string{"BACKEND", "made-up", "q4", "backend", " ui "}}, "x", tagLookups)
	if got := strings.Join(r.Tags, ","); got != "backend,Q4,ui" {
		t.Errorf("tags = %q, want backend,Q4,ui", got)
	}
	if r := Normalise(Result{}, "x", tagLookups); r.Tags == nil || len(r.Tags) != 0 {
		t.Errorf("no tags should be an empty list, got %#v", r.Tags)
	}
	many := Lookups{Tags: []string{"a", "b", "c", "d", "e", "f", "g"}}
	if got := Normalise(Result{Tags: many.Tags}, "x", many).Tags; len(got) != maxCaptureTags {
		t.Errorf("%d tags, want at most %d", len(got), maxCaptureTags)
	}
}

// A tag typed with a # counts with or without a model, as long as it exists.
func TestHashtagsInTheLineAreTagsEvenWithoutAModel(t *testing.T) {
	var p *Parser // no provider: the manual form
	r := p.Parse(context.Background(), "Fix the login bug #backend, #nonexistent and #Q4.", tagLookups)
	if !r.Fallback {
		t.Fatal("expected the manual fallback")
	}
	if got := strings.Join(r.Tags, ","); got != "backend,Q4" {
		t.Errorf("tags = %q, want backend,Q4 (an unknown tag is ignored)", got)
	}
	if len(r.Entries) != 1 || strings.Join(r.Entries[0].Tags, ",") != "backend,Q4" {
		t.Errorf("the entry has %v", r.Entries[0].Tags)
	}
}

func TestThePromptListsTheTags(t *testing.T) {
	if p := systemPrompt(tagLookups); !strings.Contains(p, "Tags: backend, Q4, ui") {
		t.Error("the tags are not in the prompt")
	}
	if p := systemPrompt(Lookups{}); !strings.Contains(p, "Tags: none") {
		t.Error("an empty tag list should say none")
	}
}
