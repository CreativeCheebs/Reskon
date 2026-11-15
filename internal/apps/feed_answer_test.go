package apps_test

import (
	"strings"
	"testing"
	"time"

	"jitterbug/internal/apps"
)

var now = time.Date(2026, 11, 15, 12, 0, 0, 0, time.UTC)

func parse(t *testing.T, shape, body string) *apps.DataResult {
	t.Helper()
	res, err := apps.ParseAnswer([]byte(body), shape, "day", "2026-11-14", "2026-11-15", now)
	if err != nil {
		t.Fatalf("%s: %v", body, err)
	}
	return res
}

// Each shape of docs/plugins.md 6.2 becomes the metrics' result shape, so
// Reskon's own charts draw it.
func TestParseAnswerShapes(t *testing.T) {
	n := parse(t, "number", `{"shape":"number","label":"Streak","unit":"days","value":12}`)
	if n.Total != 12 || n.Unit != "days" || n.Label != "Streak" || len(n.Points) != 1 {
		t.Errorf("number: %+v", n)
	}
	s := parse(t, "series", `{"shape":"series","unit":"count","points":[{"key":"2026-11-14","label":"14 Nov","value":3},{"key":"2026-11-15","value":5}],"total":8}`)
	if s.Total != 8 || len(s.Points) != 2 || s.Points[1].Label != "2026-11-15" || s.Group != "day" || s.From != "2026-11-14" || len(s.Series) != 0 {
		t.Errorf("series: %+v", s)
	}
	// Splits: every split gets a series, named ones first.
	sp := parse(t, "series", `{"shape":"series","points":[{"key":"a","value":1,"split":"walk"},{"key":"a","value":2,"split":"read"}],"series":[{"key":"read","label":"Read","color":"#112233"},{"key":"x","color":"red"}]}`)
	if len(sp.Series) != 3 || sp.Series[0].Label != "Read" || *sp.Series[0].Color != "#112233" || sp.Series[1].Color != nil || sp.Series[2].Key != "walk" || sp.Series[2].Total != 1 || sp.Total != 3 {
		t.Errorf("split series: %+v", sp.Series)
	}
	tb := parse(t, "table", `{"shape":"table","columns":[{"key":"habit","label":"Habit"},{"key":"done","label":"Days done","unit":"count"}],"rows":[{"habit":"Meditate","done":6,"extra":"dropped"},{"habit":"<b>Walk</b>"}]}`)
	if tb.Table == nil || len(tb.Table.Rows) != 2 || tb.Table.Rows[0]["done"] != 6.0 || tb.Table.Rows[1]["done"] != nil || tb.Table.Rows[1]["habit"] != "<b>Walk</b>" {
		t.Errorf("table: %+v", tb.Table)
	}
	if _, ok := tb.Table.Rows[0]["extra"]; ok {
		t.Error("a key no column names was kept")
	}
	c := parse(t, "checklist", `{"shape":"checklist","label":"Today","items":[{"key":"meditate","label":"Meditate","done":true,"detail":"10 min"},{"key":"walk","label":"Walk","done":false}]}`)
	if c.Total != 1 || c.Points[0].Value != 1 || c.Points[0].Detail != "10 min" || c.Points[1].Value != 0 || c.Label != "Today" {
		t.Errorf("checklist: %+v", c)
	}
	l := parse(t, "list", `{"shape":"list","items":[{"label":"Longest streak","value":"21 days"},{"label":"Habits","value":3}]}`)
	if len(l.Points) != 2 || l.Points[0].Detail != "21 days" || l.Points[1].Detail != "3" {
		t.Errorf("list: %+v", l.Points)
	}
	// Empty is fine.
	if e := parse(t, "series", `{"shape":"series","points":[]}`); len(e.Points) != 0 || e.Points == nil {
		t.Errorf("empty: %+v", e)
	}
	// The app's own time, if older than now; never later.
	if r := parse(t, "list", `{"shape":"list","items":[],"fetched_at":"2026-11-15T08:30:00Z"}`); r.FetchedAt != "2026-11-15T08:30:00Z" {
		t.Errorf("fetched_at = %s", r.FetchedAt)
	}
	if r := parse(t, "list", `{"shape":"list","items":[],"fetched_at":"2027-01-01T00:00:00Z"}`); r.FetchedAt != "2026-11-15T12:00:00Z" {
		t.Errorf("future fetched_at = %s", r.FetchedAt)
	}
}

// Anything that does not match the contract is refused, and the message
// never repeats the app's words.
func TestParseAnswerRefuses(t *testing.T) {
	long := strings.Repeat("x", 500)
	many := `{"shape":"series","points":[` + strings.Repeat(`{"key":"k","value":1},`, 2000) + `{"key":"k","value":1}]}`
	for shape, bodies := range map[string][]string{
		"number": {
			`not json`, `{"shape":"series","points":[]}`, `{"shape":"number"}`, `{"shape":"number","value":"12"}`,
			`{"shape":"number","value":1e300}`, `{"shape":"number","value":1,"unit":"` + long + `"}`,
			`{"shape":"number","value":1,"label":"a\u0007b"}`, `{"shape":"number","value":1,"label":"evil\u202ename"}`,
			`{"shape":"number","value":1,"label":"evil\u200bname"}`, `{"shape":"number","value":1,"label":"\ufeffevil"}`, `{"shape":"number","value":1,"label":"evil\u00adname"}`,
			`{"shape":"number","value":1,"fetched_at":"yesterday"}`,
		},
		"series": {
			`{"shape":"series","points":[{"key":"a"}]}`, `{"shape":"series","points":[{"value":1}]}`,
			`{"shape":"series","points":[{"key":"a","value":1},{"key":"a","value":2}]}`,
			`{"shape":"series","points":[{"key":"a","value":1,"split":"x"},{"key":"b","value":2}]}`,
			`{"shape":"series","points":[{"key":"` + long + `","value":1}]}`,
			many,
		},
		"table": {
			`{"shape":"table","columns":[],"rows":[]}`, `{"shape":"table","columns":[{"key":"a b"}],"rows":[]}`,
			`{"shape":"table","columns":[{"key":"a"},{"key":"a"}],"rows":[]}`,
			`{"shape":"table","columns":[{"key":"a"}],"rows":[{"a":[1,2]}]}`,
			`{"shape":"table","columns":[{"key":"a"}],"rows":[{"a":{"b":1}}]}`,
		},
		"checklist": {
			`{"shape":"checklist","items":[{"label":"A"}]}`, `{"shape":"checklist","items":[{"label":"A","done":"yes"}]}`,
			`{"shape":"checklist","items":[{"done":true}]}`,
			`{"shape":"checklist","items":[{"key":"a","label":"A","done":true},{"key":"a","label":"B","done":true}]}`,
		},
		"list": {`{"shape":"list","items":[{"value":"x"}]}`, `{"shape":"list","items":[{"label":"A","value":true}]}`},
	} {
		for _, b := range bodies {
			_, err := apps.ParseAnswer([]byte(b), shape, "", "", "", now)
			if err == nil {
				t.Errorf("%s accepted %.80s", shape, b)
				continue
			}
			if strings.Contains(err.Error(), "evil") || strings.Contains(err.Error(), "xxxxx") {
				t.Errorf("message repeats the app's text: %v", err)
			}
		}
	}
}

// A cumulative chart gets running totals from the server, one per split.
func TestForVizCumulative(t *testing.T) {
	s := parse(t, "series", `{"shape":"series","points":[{"key":"a","value":1,"split":"x"},{"key":"a","value":2,"split":"y"},{"key":"b","value":3,"split":"x"}]}`)
	c := s.ForViz("cumulative")
	if !c.Cumulative || c.Points[2].Value != 4 || c.Points[1].Value != 2 || s.Points[2].Value != 3 {
		t.Errorf("cumulative: %+v (original %+v)", c.Points, s.Points)
	}
	if s.ForViz("bar") != s {
		t.Error("bars changed the result")
	}
}
