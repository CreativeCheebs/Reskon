package db

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
)

// App data widgets (source "app_data"): numbers, lists, tables and
// checklists a connected app sends, drawn by Reskon's own charts
// (docs/plugins.md section 6). Like an app page, the query only names
// things: the app (the id in its description file), one of its data
// widgets, and that feed's own range and grouping. This package checks the
// shape only; the phone runs it and has no connected apps. Whether the app
// offers that widget, and whether the chart type suits its shape, is
// checked by the API against the person's apps file.

// SourceAppData is the source of an app data widget.
const SourceAppData = "app_data"

// VizChecklist draws an app's checklist: a tick or an empty box per item.
// Read-only: ticking happens in the app's own page. It is not one of
// WidgetVizzes, so no metric can be drawn as a checklist.
const VizChecklist = "checklist"

// AppDataVizzes says which chart types suit each shape an app may send.
// split_bar needs a series with splits; the editor offers it only then.
var AppDataVizzes = map[string][]string{
	"number":    {"number"},
	"series":    {"bar", "line", "cumulative", "number", "split_bar"},
	"table":     {"table"},
	"list":      {"list"},
	"checklist": {VizChecklist},
}

// appDataVizAny is every viz some shape allows.
func appDataVizAny(v string) bool {
	for _, list := range AppDataVizzes {
		if contains(list, v) {
			return true
		}
	}
	return false
}

// AppDataRanges are the date ranges a feed can be asked for: the metrics'
// ranges except "all", which means "since your first Reskon record" and so
// nothing to an app.
var AppDataRanges = []string{"today", "7d", "30d", "90d", "1y", "month"}

// AppDataQuery is an app data widget's query, e.g.
// {"app":"habits","widget":"last_days","range":"7d","group":"day"}.
// Range and group are only for a feed that takes them.
type AppDataQuery struct {
	App    string `json:"app"`
	Widget string `json:"widget"`
	Range  string `json:"range,omitempty"`
	Group  string `json:"group,omitempty"`
}

// ParseAppDataQuery reads an app data widget's query. Only these four
// fields are allowed, so a metric query cannot pass for one.
func ParseAppDataQuery(raw json.RawMessage) (AppDataQuery, error) {
	var q AppDataQuery
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&q); err != nil {
		return q, invalid(`an app data widget's query is {"app": "<app id>", "widget": "<widget id>", "range": "7d", "group": "day"} (range and group only where the app's widget takes them)`)
	}
	if !appIDPattern.MatchString(q.App) || !appIDPattern.MatchString(q.Widget) {
		return q, invalid("an app data widget's app and widget must be 1 to 40 lower-case letters, digits or _")
	}
	if q.Range != "" && !contains(AppDataRanges, q.Range) {
		return q, invalid("an app data widget's range must be one of %s", strings.Join(AppDataRanges, ", "))
	}
	if q.Group != "" && !appIDPattern.MatchString(q.Group) {
		return q, invalid("an app data widget's group must be 1 to 40 lower-case letters, digits or _")
	}
	return q, nil
}

// ResolveAppRange turns an app data widget's range into two inclusive
// dates (YYYY-MM-DD), counted back from today, the person's own today. No
// range is 7 days.
func ResolveAppRange(rng, today string) (from, to string, err error) {
	if rng == "" {
		rng = "7d"
	}
	if !contains(AppDataRanges, rng) || !validDate(today) {
		return "", "", invalid("an app data widget's range must be one of %s", strings.Join(AppDataRanges, ", "))
	}
	// Never "all", so resolveRange needs no database here.
	return (*DB)(nil).resolveRange(context.Background(), &MetricQuery{Range: rng}, today)
}

// ValidDates checks an explicit from/to pair (the dashboard's dates).
func ValidDates(from, to string) bool {
	return validDate(from) && validDate(to) && from <= to
}
