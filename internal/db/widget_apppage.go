package db

import (
	"bytes"
	"encoding/json"
	"regexp"
)

// App page widgets (source "app_page"): a connected app's own small page,
// shown in a frame (docs/plugins.md section 4). The query only names the
// page: the app by the id in its description file (stable across
// reconnecting) and one of its widgets. This package never looks the app
// up: the phone runs it and has no connected apps. Whether the app and the
// page exist is checked by the API, against the person's apps file.

// VizPage is the viz of every app page widget: the app's page draws itself.
// It is not one of WidgetVizzes, so no metric can be drawn as a page.
const VizPage = "page"

// AppPageQuery is an app page widget's query, e.g. {"app":"habits","widget":"today"}.
type AppPageQuery struct {
	App    string `json:"app"`
	Widget string `json:"widget"`
}

// appIDPattern is the id rule of the plugin contract (docs/plugins.md section 2).
var appIDPattern = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)

// ParseAppPageQuery reads an app page widget's query. Only "app" and
// "widget" are allowed, so a metric query cannot pass for one.
func ParseAppPageQuery(raw json.RawMessage) (AppPageQuery, error) {
	var q AppPageQuery
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&q); err != nil {
		return q, invalid(`an app page widget's query is {"app": "<app id>", "widget": "<widget id>"}`)
	}
	if !appIDPattern.MatchString(q.App) || !appIDPattern.MatchString(q.Widget) {
		return q, invalid("an app page widget's app and widget must be 1 to 40 lower-case letters, digits or _")
	}
	return q, nil
}
