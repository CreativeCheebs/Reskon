package db

import (
	"context"
	"encoding/json"
	"testing"
)

// A states widget saves an empty query, its viz is always "states", and no
// metric, board, journal or app data can pass for one.
func TestStatesWidget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, _ := d.ListDashboards(ctx)
	dash := itoa(all[0].ID)
	f := func(s string) Fields { return fields(t, s) }

	w, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"states","title":"Buffs and debuffs","query":{},"w":6,"h":2}`))
	if err != nil {
		t.Fatal(err)
	}
	if w.Source != SourceStates || w.Viz != VizStates {
		t.Fatalf("saved %+v", w)
	}
	for _, bad := range []string{
		`{"dashboard_id":` + dash + `,"source":"states","query":{"range":"7d"}}`,
		`{"dashboard_id":` + dash + `,"source":"states","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"states","query":null}`,
		`{"dashboard_id":` + dash + `,"source":"states","query":[]}`,
		`{"dashboard_id":` + dash + `,"source":"states","viz":"bar","query":{}}`,
		`{"dashboard_id":` + dash + `,"viz":"states","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"journal","viz":"states","query":{}}`,
		`{"dashboard_id":` + dash + `,"source":"view","viz":"states","query":{"view_id":1}}`,
	} {
		if _, err := d.CreateWidget(ctx, f(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	// A change is checked against the widget's own source.
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"title":"Other","x":2,"query":{}}`)); err != nil {
		t.Errorf("edit: %v", err)
	}
	for _, bad := range []string{`{"query":{"metric":"points"}}`, `{"viz":"number"}`, `{"source":"metric","viz":"number","query":{"metric":"points"}}`} {
		if _, err := d.PatchWidget(ctx, w.ID, f(bad)); err == nil {
			t.Errorf("patched with %s", bad)
		}
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("a states widget ran as a metric")
	}
}

// A states widget carries no ids, so it reaches the other device as it is.
func TestSyncAStatesWidgetIsUnchanged(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	w, err := srv.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"source":"states","query":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)
	var uid string
	if err := srv.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = 'widget' AND id = ?`, w.ID).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	pw, ok := idOf(ctx, phone, "widget", uid)
	if !ok {
		t.Fatal("the widget did not reach the phone")
	}
	var source, viz string
	if err := phone.QueryRowContext(ctx, `SELECT source, viz FROM widget WHERE id = ?`, pw).Scan(&source, &viz); err != nil {
		t.Fatal(err)
	}
	if source != SourceStates || viz != VizStates {
		t.Errorf("the phone's widget is %s %s", source, viz)
	}
}

// dashboard_toolbar is "top" or "left", nothing else.
func TestDashboardToolbarSetting(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	for _, ok := range []string{`"top"`, `"left"`} {
		if err := d.PutSetting(ctx, "dashboard_toolbar", json.RawMessage(ok)); err != nil {
			t.Errorf("%s refused: %v", ok, err)
		}
	}
	for _, bad := range []string{`"right"`, `true`, `null`, `1`, `""`} {
		if err := d.PutSetting(ctx, "dashboard_toolbar", json.RawMessage(bad)); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
}
