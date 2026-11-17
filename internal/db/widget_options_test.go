package db

import (
	"context"
	"strings"
	"testing"
)

// Chart options are saved with the widget: colours are checked, and any
// option this version does not know is kept untouched.
func TestWidgetChartOptions(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	w, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"points","split":"energy_type"},
		"options":{"series_colors":{"1":"#FF8800","2":"#00aa55"},"color":"warn","show_values":true,"from_a_newer_reskon":{"x":1}}}`))
	if err != nil {
		t.Fatal(err)
	}
	got, err := d.GetWidget(ctx, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"#FF8800"`, `"from_a_newer_reskon"`} {
		if !strings.Contains(string(got.Options), want) {
			t.Errorf("options %s lost %s", got.Options, want)
		}
	}
	for _, bad := range []string{
		`{"series_colors":{"1":"red"}}`,
		`{"series_colors":["#112233"]}`,
		`{"color":5}`,
		`{"show_values":"yes"}`,
		`{"show_average":1}`,
	} {
		_, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"points"},"options":`+bad+`}`))
		if err == nil || !strings.Contains(err.Error(), "options.") {
			t.Errorf("options %s: err = %v", bad, err)
		}
	}
}

func TestWidgetColorOption(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	for _, ok := range []string{`"warn"`, `"#aabbcc"`, `"difficulty3"`, `null`} {
		if _, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"points"},"options":{"color":`+ok+`}}`)); err != nil {
			t.Errorf("color %s refused: %v", ok, err)
		}
	}
	for _, bad := range []string{`"red"`, `"#abc"`, `"url(x)"`, `""`} {
		if _, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"points"},"options":{"color":`+bad+`}}`)); err == nil {
			t.Errorf("color %s accepted", bad)
		}
	}
}

func TestWidgetCustomDatesSpan(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	mk := func(from, to string) error {
		_, err := d.CreateWidget(ctx, fields(t, `{"dashboard_id":1,"viz":"bar","query":{"metric":"points","from":"`+from+`","to":"`+to+`"}}`))
		return err
	}
	if err := mk("2026-01-01", "2026-06-30"); err != nil {
		t.Errorf("ordinary range refused: %v", err)
	}
	if err := mk("2000-01-01", "2026-01-01"); err == nil {
		t.Error("26-year span accepted")
	}
	if err := mk("1900-01-01", "1900-01-05"); err == nil {
		t.Error("year 1900 accepted")
	}
}
