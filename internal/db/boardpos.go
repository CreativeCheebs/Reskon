package db

import (
	"context"
	"database/sql"
)

// endOfColumn returns a board_pos one past the last card in a status column.
func endOfColumn(ctx context.Context, q querier, statusID int64) (float64, error) {
	var max sql.NullFloat64
	err := q.QueryRowContext(ctx, `SELECT MAX(board_pos) FROM task WHERE status_id = ? AND deleted_at IS NULL`,
		statusID).Scan(&max)
	if !max.Valid {
		return 1, err
	}
	return max.Float64 + 1, err
}
