package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// A view widget names one view that exists, its viz is always "board", and
// it keeps its source.
func TestViewWidget(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	all, _ := d.ListDashboards(ctx)
	views, _ := d.ListViews(ctx)
	dash, view := itoa(all[0].ID), itoa(views[0].ID)
	f := func(s string) Fields { return fields(t, s) }

	w, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"view","title":"Open","query":{"view_id":`+view+`},"w":8,"h":5}`))
	if err != nil {
		t.Fatal(err)
	}
	if w.Source != SourceView || w.Viz != VizBoard || string(w.Query) != `{"view_id":`+view+`}` {
		t.Fatalf("saved %+v", w)
	}
	for _, bad := range []string{
		`{"dashboard_id":` + dash + `,"source":"view","query":{}}`,
		`{"dashboard_id":` + dash + `,"source":"view","query":{"view_id":0}}`,
		`{"dashboard_id":` + dash + `,"source":"view","query":{"view_id":"3"}}`,
		`{"dashboard_id":` + dash + `,"source":"view","query":{"view_id":99999}}`,
		// A filter never rides on the widget: the server resolves the view's own.
		`{"dashboard_id":` + dash + `,"source":"view","query":{"view_id":` + view + `,"filters":{"area":[1]}}}`,
		`{"dashboard_id":` + dash + `,"source":"view","query":{"view_id":` + view + `,"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"view","viz":"bar","query":{"view_id":` + view + `}}`,
		// Neither a metric nor app data may be drawn as a board.
		`{"dashboard_id":` + dash + `,"viz":"board","query":{"metric":"points"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_data","viz":"board","query":{"app":"habits","widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"source":"app_page","viz":"board","query":{"app":"habits","widget":"today"}}`,
		`{"dashboard_id":` + dash + `,"viz":"bar","query":{"view_id":` + view + `}}`,
	} {
		if _, err := d.CreateWidget(ctx, f(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	// A patch is checked against the widget's own source.
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"title":"Other","x":2,"y":1}`)); err != nil {
		t.Errorf("rename and move: %v", err)
	}
	if _, err := d.PatchWidget(ctx, w.ID, f(`{"source":"view","viz":"board","query":{"view_id":`+view+`}}`)); err != nil {
		t.Errorf("same source again: %v", err)
	}
	for _, bad := range []string{
		`{"source":"metric","viz":"number","query":{"metric":"points","range":"today"}}`,
		`{"query":{"metric":"points","range":"today"}}`,
		`{"query":{"view_id":99999}}`,
		`{"viz":"number"}`,
	} {
		if _, err := d.PatchWidget(ctx, w.ID, f(bad)); err == nil {
			t.Errorf("patched with %s", bad)
		}
	}
	if _, err := d.WidgetQuery(ctx, w.ID); err == nil {
		t.Error("a view widget ran as a metric")
	}

	// A deleted view cannot be picked, but a widget already showing it stays
	// (it says its view is gone) and can still be moved or renamed.
	gone, err := d.CreateView(ctx, f(`{"name":"Gone","layout":"board"}`))
	if err != nil {
		t.Fatal(err)
	}
	g := itoa(gone.ID)
	w2, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"view","query":{"view_id":`+g+`}}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteView(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateWidget(ctx, f(`{"dashboard_id":`+dash+`,"source":"view","query":{"view_id":`+g+`}}`)); err == nil {
		t.Error("a deleted view was accepted")
	}
	if _, err := d.PatchWidget(ctx, w2.ID, f(`{"title":"Still here","y":4}`)); err != nil {
		t.Errorf("rename a widget whose view was deleted: %v", err)
	}
}

// A view widget follows its view to the other device by the view's own id
// there, and a view the other device does not have drops the id.
func TestSyncAViewWidgetNamesTheSameViewOnTheOtherDevice(t *testing.T) {
	ctx := context.Background()
	srv, phone := openTest(t), openTest(t)
	for _, n := range []string{"decoy-one", "decoy-two"} { // different ids on the two devices
		if _, err := phone.CreateView(ctx, fields(t, fmt.Sprintf(`{"name":%q,"layout":"board"}`, n))); err != nil {
			t.Fatal(err)
		}
	}
	v, err := srv.CreateView(ctx, fields(t, `{"name":"Target","layout":"board"}`))
	if err != nil {
		t.Fatal(err)
	}
	w, err := srv.CreateWidget(ctx, fields(t, fmt.Sprintf(`{"dashboard_id":1,"source":"view","query":{"view_id":%d}}`, v.ID)))
	if err != nil {
		t.Fatal(err)
	}
	syncOnce(t, phone, srv)
	syncOnce(t, phone, srv)

	var uid, vuid string
	if err := srv.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = 'widget' AND id = ?`, w.ID).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if err := srv.QueryRowContext(ctx, `SELECT uid FROM sync_idmap WHERE tbl = 'view' AND id = ?`, v.ID).Scan(&vuid); err != nil {
		t.Fatal(err)
	}
	pw, ok := idOf(ctx, phone, "widget", uid)
	if !ok {
		t.Fatal("the widget did not reach the phone")
	}
	pv, ok := idOf(ctx, phone, "view", vuid)
	if !ok {
		t.Fatal("the view did not reach the phone")
	}
	var query, source, viz string
	if err := phone.QueryRowContext(ctx, `SELECT query, source, viz FROM widget WHERE id = ?`, pw).Scan(&query, &source, &viz); err != nil {
		t.Fatal(err)
	}
	want := fmt.Sprintf(`"view_id":%d`, pv)
	if !strings.Contains(strings.ReplaceAll(query, " ", ""), want) || source != SourceView || viz != VizBoard {
		t.Errorf("the phone's widget is %s %s %s, want the phone's own id for the view (%s)", source, viz, query, want)
	}
	if pv == v.ID {
		t.Fatal("the test needs the two devices to number the view differently")
	}
}

// A view this device has no mapping for keeps its id in the widget's query
// instead of being dropped: no view here has that id, so the widget says its
// view is gone, and the query stays whole (an emptied one could win a tie on
// a later push and erase the other device's).
func TestSyncAViewWidgetKeepsAnIdItCannotTranslate(t *testing.T) {
	none := func(table, v string) (string, bool) { return "", false }
	got := swapJSONColumn("widget", "query", `{"view_id":"somebody-elses-uid"}`, none)
	if s, _ := got.(string); !strings.Contains(s, `"view_id":"somebody-elses-uid"`) {
		t.Errorf("the query became %s", got)
	}
	// With a mapping it is swapped as before.
	one := func(table, v string) (string, bool) { return "42", table == "view" }
	if got, _ := swapJSONColumn("widget", "query", `{"view_id":"abc"}`, one).(string); !strings.Contains(got, `"view_id":42`) {
		t.Errorf("the query became %s", got)
	}
}
