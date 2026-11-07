package db

import (
	"context"
	"encoding/json"
	"testing"
)

func TestShowDayScreenIsAYesOrNo(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)

	// Off until someone turns it on: nothing is stored.
	got, err := d.Settings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["show_day_screen"]; ok {
		t.Fatal("a new database already has show_day_screen")
	}

	for _, ok := range []string{`true`, `false`, ` true `} {
		if err := d.PutSetting(ctx, "show_day_screen", json.RawMessage(ok)); err != nil {
			t.Errorf("%s refused: %v", ok, err)
		}
	}
	for _, bad := range []string{`"yes"`, `1`, `0`, `null`, `{}`, `[]`, `"true"`} {
		if err := d.PutSetting(ctx, "show_day_screen", json.RawMessage(bad)); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}

	if err := d.PutSetting(ctx, "show_day_screen", json.RawMessage(`true`)); err != nil {
		t.Fatal(err)
	}
	got, _ = d.Settings(ctx)
	if string(got["show_day_screen"]) != "true" {
		t.Errorf("stored %s, want true", got["show_day_screen"])
	}
}
