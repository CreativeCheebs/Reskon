package db

import (
	"context"
	"database/sql"
	"time"
)

// ListTasks returns every non-deleted task with derived values.
func (d *DB) ListTasks(ctx context.Context) ([]*Task, error) {
	tasks, err := collect(ctx, d, `SELECT `+taskCols+` FROM task WHERE deleted_at IS NULL ORDER BY status_id, board_pos`,
		func(r *sql.Rows) (*Task, error) { return scanTask(r) })
	if err != nil {
		return nil, err
	}
	return tasks, d.derive(ctx, tasks, time.Now())
}
