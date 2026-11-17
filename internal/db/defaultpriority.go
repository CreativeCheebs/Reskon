package db

import (
	"context"
	"database/sql"
	"encoding/json"
)

// The `default_priority` setting is the priority a new task gets when it is
// created without one: {"priority_id": 2}, or {"priority_id": null} for
// "None". With no setting, the default is the built-in priority with weight
// 1.0 (seeded as "Normal"), found by its flag and weight, never by its name.
// A task created with an explicit priority_id (even null) keeps it.

type defaultPriority struct {
	PriorityID *int64 `json:"priority_id"`
}

// checkDefaultPriority validates a `default_priority` value before it is saved.
func (d *DB) checkDefaultPriority(ctx context.Context, value json.RawMessage) error {
	var v defaultPriority
	if err := json.Unmarshal(value, &v); err != nil {
		return invalid("default_priority: %v", err)
	}
	if v.PriorityID == nil {
		return nil
	}
	var one int
	err := d.QueryRowContext(ctx, `SELECT 1 FROM priority WHERE id = ? AND deleted_at IS NULL`, *v.PriorityID).Scan(&one)
	if err == sql.ErrNoRows {
		return invalid("default_priority: priority %d does not exist", *v.PriorityID)
	}
	return err
}

// defaultPriorityID returns the priority new tasks get, or nil for none.
func defaultPriorityID(ctx context.Context, q querier) (*int64, error) {
	var raw string
	err := q.QueryRowContext(ctx, `SELECT value FROM setting WHERE key = 'default_priority'`).Scan(&raw)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	var id sql.NullInt64
	if err == sql.ErrNoRows {
		err = q.QueryRowContext(ctx, `SELECT id FROM priority WHERE is_builtin = 1 AND weight = 1.0
			AND deleted_at IS NULL ORDER BY position, id LIMIT 1`).Scan(&id)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
	} else {
		var v defaultPriority
		if json.Unmarshal([]byte(raw), &v) != nil || v.PriorityID == nil {
			return nil, nil
		}
		// A priority deleted since the choice was made counts as none.
		err = q.QueryRowContext(ctx, `SELECT id FROM priority WHERE id = ? AND deleted_at IS NULL`, *v.PriorityID).Scan(&id)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
	}
	if !id.Valid {
		return nil, nil
	}
	return &id.Int64, nil
}
