package db

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestTermsSettingIsCheckedAndTrimmed(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)

	good := `{"task": "  todo ", "tasks": "todos", "epic": "story", "epics": "stories"}`
	if err := d.PutSetting(ctx, "terms", json.RawMessage(good)); err != nil {
		t.Fatal(err)
	}
	got, err := d.Settings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var terms map[string]string
	if err := json.Unmarshal(got["terms"], &terms); err != nil {
		t.Fatal(err)
	}
	if terms["task"] != "todo" || terms["tasks"] != "todos" || terms["epics"] != "stories" {
		t.Errorf("stored %v, want the words trimmed as typed", terms)
	}

	// A person's own capital letters are kept; a part of the set is fine.
	if err := d.PutSetting(ctx, "terms", json.RawMessage(`{"task": "ToDo"}`)); err != nil {
		t.Errorf("a partial set refused: %v", err)
	}
	got, _ = d.Settings(ctx)
	if string(got["terms"]) != `{"task":"ToDo"}` {
		t.Errorf("stored %s", got["terms"])
	}

	// The reset the screens send, and words in other scripts, are fine.
	for _, ok := range []string{`{}`, `{"task": "काम", "tasks": "कार्य"}`, `{"task": "don’t"}`, `{"task": "to-do"}`} {
		if err := d.PutSetting(ctx, "terms", json.RawMessage(ok)); err != nil {
			t.Errorf("%s refused: %v", ok, err)
		}
	}
	if err := d.PutSetting(ctx, "terms", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	got, _ = d.Settings(ctx)
	if string(got["terms"]) != `{}` {
		t.Errorf("reset stored %s, want {}", got["terms"])
	}

	bad := []string{
		`{"task": "--"}`, `{"task": "​x"}`, `{"task": "a‮b"}`,
		// 13 letters outside the basic plane: 13 characters but 26 UTF-16 units.
		`{"task": "` + strings.Repeat("\U0001D49C", 13) + `"}`,
		`"todo"`, `null`, `[]`, `1`,
		`{"task": ""}`, `{"task": "   "}`, `{"task": 5}`, `{"task": null}`,
		`{"ticket": "x"}`, `{"task": "<b>x</b>"}`, `{"task": "a\nb"}`,
		`{"task": "` + strings.Repeat("a", 25) + `"}`,
	}
	for _, b := range bad {
		if err := d.PutSetting(ctx, "terms", json.RawMessage(b)); err == nil {
			t.Errorf("%s accepted", b)
		}
	}
	if err := d.PutSetting(ctx, "terms", json.RawMessage(`{"task": "`+strings.Repeat("a", 24)+`"}`)); err != nil {
		t.Errorf("24 characters refused: %v", err)
	}
}
