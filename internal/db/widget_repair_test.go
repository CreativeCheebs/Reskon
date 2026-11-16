package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
)

// Migration 021: a server not yet upgraded is sent new kinds of widget by a
// newer phone. It keeps them without their kind (it has no source column)
// and a Board's view as the phone's sync id. After the upgrade each widget
// gets its kind back and the Board its own view id; metric widgets are
// untouched. This is what happened on the live server with Home.
func TestRepairWidgetsFromANewerDevice(t *testing.T) {
	var viewID int64
	path := openBefore(t, "019_", func(d *sql.DB) {
		mustExec(t, d, `INSERT INTO dashboard (name, position) VALUES ('From phone', 9)`)
		d.QueryRow(`SELECT id FROM view WHERE deleted_at IS NULL ORDER BY id LIMIT 1`).Scan(&viewID)
		var uid string
		if err := d.QueryRow(`SELECT uid FROM sync_idmap WHERE tbl = 'view' AND id = ?`, viewID).Scan(&uid); err != nil {
			t.Fatalf("view %d has no sync id: %v", viewID, err)
		}
		add := func(title, viz, query string) {
			mustExec(t, d, `INSERT INTO widget (dashboard_id, title, viz, query)
				VALUES ((SELECT id FROM dashboard WHERE name = 'From phone'), ?, ?, ?)`, title, viz, query)
		}
		add("board", "board", `{"view_id":"`+uid+`"}`)
		add("board, unknown view", "board", `{"view_id":"no-such-uid"}`)
		add("page", "page", `{"app":"habits","widget":"today"}`)
		add("data", "checklist", `{"app":"habits","widget":"today_list"}`)
		add("data as bars", "bar", `{"app":"habits","widget":"last_days","range":"7d"}`)
		add("journal", "journal", `{"range":"7d"}`)
		add("metric", "bar", `{"metric":"points","range":"7d","group":"day"}`)
	})
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()

	want := map[string]string{
		"board": "view", "board, unknown view": "view", "page": "app_page",
		"data": "app_data", "data as bars": "app_data", "journal": "journal", "metric": "metric",
	}
	rows, err := d.QueryContext(context.Background(), `SELECT title, source, query FROM widget
		WHERE dashboard_id = (SELECT id FROM dashboard WHERE name = 'From phone')`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	seen := 0
	for rows.Next() {
		var title, source, query string
		if err := rows.Scan(&title, &source, &query); err != nil {
			t.Fatal(err)
		}
		seen++
		if source != want[title] {
			t.Errorf("%s: source %q, want %q", title, source, want[title])
		}
		var q map[string]any
		json.Unmarshal([]byte(query), &q)
		switch title {
		case "board":
			if v, ok := q["view_id"].(float64); !ok || int64(v) != viewID {
				t.Errorf("board's view is %v, want this device's id %d", q["view_id"], viewID)
			}
		case "board, unknown view":
			if q["view_id"] != "no-such-uid" {
				t.Errorf("unmapped view changed to %v", q["view_id"])
			}
		}
	}
	if seen != len(want) {
		t.Fatalf("saw %d widgets, want %d", seen, len(want))
	}

	// The repaired Board reads as a Board, and the metric widget still runs.
	w := widgetByTitle(t, d, "board")
	if _, err := ParseViewQuery(w.Query); err != nil {
		t.Errorf("repaired board query: %v", err)
	}
	if _, err := d.WidgetQuery(context.Background(), widgetByTitle(t, d, "metric").ID); err != nil {
		t.Errorf("metric widget: %v", err)
	}
}

func widgetByTitle(t *testing.T, d *DB, title string) *Widget {
	t.Helper()
	var id int64
	if err := d.QueryRow(`SELECT id FROM widget WHERE title = ?`, title).Scan(&id); err != nil {
		t.Fatal(err)
	}
	w, err := d.GetWidget(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return w
}
