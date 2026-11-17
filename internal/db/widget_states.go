package db

import (
	"bytes"
	"encoding/json"
)

// States widgets (source "states"): the buffs and debuffs in force, drawn as
// a row of chips on the dashboard. The query is always empty ({}): the
// widget asks for the states the way the Buffs and debuffs screen does
// (GET /api/states), so what is in force is worked out on the server.

// SourceStates is the source of a states widget.
const SourceStates = "states"

// VizStates is the viz of every states widget. It is not one of
// WidgetVizzes or AppDataVizzes, so no metric can be drawn as one.
const VizStates = "states"

// ParseStatesQuery reads a states widget's query: an empty object. Any key
// is refused, so a metric query cannot pass for one.
func ParseStatesQuery(raw json.RawMessage) error {
	var q struct{}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&q); err != nil || string(bytes.TrimSpace(raw)) == "null" {
		return invalid(`a states widget's query is {}`)
	}
	return nil
}
