package db

import (
	"context"
	"database/sql"
)

// writeTransition appends one row to the status_transition log. The log is
// append-only: nothing in this package updates or deletes its rows.
func writeTransition(ctx context.Context, tx *sql.Tx, taskID int64, from *int64, to int64, reason, at string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO status_transition (task_id, from_status_id, to_status_id, reason, at)
		VALUES (?, ?, ?, ?, ?)`, taskID, from, to, reason, at)
	return err
}
