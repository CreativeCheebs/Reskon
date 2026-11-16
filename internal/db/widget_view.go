package db

import (
	"bytes"
	"context"
	"encoding/json"
)

// View widgets (source "view"): a saved view's open tasks, drawn as a small
// read-only board on the dashboard. The query only names the view, e.g.
// {"view_id": 3}. The widget never carries a filter: the tab asks for the
// view's tasks the way the board does (GET /api/tasks?view=:id), so the
// filter is worked out on the server. Which columns show, and how many
// cards, is the client's drawing, like any other chart.

// SourceView is the source of a view widget.
const SourceView = "view"

// VizBoard is the viz of every view widget. It is not one of WidgetVizzes
// or AppDataVizzes, so no metric or app data can be drawn as a board.
const VizBoard = "board"

// ViewQuery is a view widget's query.
type ViewQuery struct {
	ViewID int64 `json:"view_id"`
}

// ParseViewQuery reads a view widget's query. Only "view_id" is allowed, so
// a metric query cannot pass for one.
func ParseViewQuery(raw json.RawMessage) (ViewQuery, error) {
	var q ViewQuery
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&q); err != nil || q.ViewID < 1 {
		return q, invalid(`a view widget's query is {"view_id": <the view's id>}`)
	}
	return q, nil
}

// checkViewExists refuses a view widget that names no view, or a view that
// was deleted. (A view deleted later leaves the widget in place; it says so
// instead of drawing.) f is a create's fields or a patch's.
func (d *DB) checkViewExists(ctx context.Context, f Fields) error {
	raw, ok := f["query"]
	if !ok {
		return nil
	}
	q, err := ParseViewQuery(raw)
	if err != nil {
		return err
	}
	if err := d.exists(ctx, "view", q.ViewID); err != nil {
		return invalid("view %d does not exist", q.ViewID)
	}
	return nil
}
