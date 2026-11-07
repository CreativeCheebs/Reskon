package db

import (
	"context"
	"database/sql"
	"encoding/json"
)

// sessionPoints is what a session earns when it is logged: hours x its
// energy type's points rate x difficulty, where difficulty is the
// session's, else its task's, else 1. Every energy type earns points. The
// result is stored on the session, so a later change to this formula or
// to a rate never rewrites history.
func sessionPoints(rate, hours float64, difficulty, taskDifficulty *int64) *float64 {
	d := int64(1)
	switch {
	case difficulty != nil:
		d = *difficulty
	case taskDifficulty != nil:
		d = *taskDifficulty
	}
	p := hours * rate * float64(d)
	return &p
}

// storedPoints looks up what sessionPoints needs for a session about to be
// written: its energy type's rate and its task's difficulty.
func storedPoints(ctx context.Context, q querier, energyTypeID int64, hours float64, difficulty, taskID *int64) (*float64, error) {
	var rate float64
	err := q.QueryRowContext(ctx, `SELECT points_per_hour FROM energy_type WHERE id = ?`, energyTypeID).Scan(&rate)
	if err == sql.ErrNoRows {
		return nil, invalid("energy type %d does not exist", energyTypeID)
	}
	if err != nil {
		return nil, err
	}
	var taskDiff *int64
	if taskID != nil {
		if err := q.QueryRowContext(ctx, `SELECT difficulty FROM task WHERE id = ?`, *taskID).Scan(&taskDiff); err != nil && err != sql.ErrNoRows {
			return nil, err
		}
	}
	return sessionPoints(rate, hours, difficulty, taskDiff), nil
}

// taskAndPoints reads task_id and an explicit points value from f.
func taskAndPoints(f Fields) (taskID *int64, points *float64, err error) {
	if n, ok, err := f.int64Field("task_id"); err != nil {
		return nil, nil, err
	} else if ok {
		taskID = &n
	}
	if raw, ok := f["points"]; ok && !isNull(raw) {
		var p float64
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, nil, invalid("points must be a number")
		}
		points = &p
	}
	return taskID, points, nil
}

// fillPoints sets f["points"] for a new session from its other fields.
func fillPoints(ctx context.Context, q querier, f Fields) error {
	energy, _, err := f.int64Field("energy_type_id")
	if err != nil {
		return err
	}
	var hours float64
	_ = json.Unmarshal(f["hours"], &hours) // a bad value is rejected by the checks that follow
	var difficulty, taskID *int64
	if n, ok, err := f.int64Field("difficulty"); err != nil {
		return err
	} else if ok {
		difficulty = &n
	}
	if n, ok, err := f.int64Field("task_id"); err != nil {
		return err
	} else if ok {
		taskID = &n
	}
	p, err := storedPoints(ctx, q, energy, hours, difficulty, taskID)
	if err != nil {
		return err
	}
	f["points"], _ = json.Marshal(p)
	return nil
}
