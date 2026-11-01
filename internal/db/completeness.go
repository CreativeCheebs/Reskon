package db

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
)

// Complete details: the `task_completeness` setting lists the fields an
// open task should have filled in, such as a start date, an estimate or an
// intensity. Each task's `missing` (derived on read) names the ones it
// lacks. This is about the task's information, not whether the work is
// done: done and cancelled tasks, and epics, are never incomplete. With no
// fields chosen (the default) every task is complete.

// CompletenessFields are the fields the setting may require.
var CompletenessFields = []string{"start_date", "end_date", "due_at", "estimate_h", "difficulty", "priority_id", "energy_type_id", "description", "epic_id"}

type completenessRules struct {
	Required []string `json:"required"`
}

func (d *DB) loadCompleteness(ctx context.Context) ([]string, error) {
	var r completenessRules
	if _, err := d.Setting(ctx, "task_completeness", &r); err != nil {
		return nil, err
	}
	return r.Required, nil
}

// checkCompleteness validates a `task_completeness` value before it is saved.
func checkCompleteness(value json.RawMessage) error {
	var r completenessRules
	if err := json.Unmarshal(value, &r); err != nil {
		return invalid("task_completeness: %v", err)
	}
	for _, f := range r.Required {
		if !slices.Contains(CompletenessFields, f) {
			return invalid("task_completeness: unknown field %q", f)
		}
	}
	return nil
}

// missingFields lists the required fields t has not filled in, in the
// order they were required. Only open tasks are checked.
func missingFields(t *Task, required []string) []string {
	out := []string{}
	if len(required) == 0 || t.Type != "task" || (t.Behaviour != "todo" && t.Behaviour != "in_progress") {
		return out
	}
	for _, f := range required {
		empty := false
		switch f {
		case "start_date":
			empty = t.StartDate == nil || *t.StartDate == ""
		case "end_date":
			empty = t.EndDate == nil || *t.EndDate == ""
		case "due_at":
			empty = t.DueAt == nil || *t.DueAt == ""
		case "estimate_h":
			empty = t.EstimateH == nil || *t.EstimateH <= 0
		case "difficulty":
			empty = t.Difficulty == nil
		case "priority_id":
			empty = t.PriorityID == nil
		case "energy_type_id":
			empty = t.EnergyTypeID == nil
		case "description":
			empty = t.Description == nil || strings.TrimSpace(*t.Description) == ""
		case "epic_id":
			empty = t.EpicID == nil
		}
		if empty {
			out = append(out, f)
		}
	}
	return out
}
