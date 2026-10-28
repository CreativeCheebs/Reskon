package db

import (
	"context"
	"database/sql"
)

// renormaliseGap: when two neighbours' board_pos values come within this
// distance, the column is renumbered 1, 2, 3 ... before inserting.
const renormaliseGap = 1e-6

// midpoint returns the board_pos for a card dropped between before (the card
// that will sit above it) and after (the card below). Either may be nil.
// ok is false when the new card would land within renormaliseGap of a
// neighbour; the column must be renormalised first.
func midpoint(before, after *float64) (pos float64, ok bool) {
	switch {
	case before != nil && after != nil:
		if (*after-*before)/2 < renormaliseGap {
			return 0, false
		}
		return (*before + *after) / 2, true
	case before != nil:
		return *before + 1, true
	case after != nil:
		return *after - 1, true
	default:
		return 1, true
	}
}

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

// renormalise renumbers a column 1, 2, 3 ... in its current order,
// skipping the card being moved.
func renormalise(ctx context.Context, tx *sql.Tx, statusID, skipTaskID int64) error {
	ids, err := collect(ctx, tx, `SELECT id FROM task WHERE status_id = ? AND deleted_at IS NULL AND id <> ?
		ORDER BY board_pos, id`, func(r *sql.Rows) (id int64, err error) {
		err = r.Scan(&id)
		return
	}, statusID, skipTaskID)
	if err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE task SET board_pos = ? WHERE id = ?`, float64(i+1), id); err != nil {
			return err
		}
	}
	return nil
}

// neighbourPos reads the board_pos of a neighbour card, checking it sits in
// the target column. A nil id gives a nil position.
func neighbourPos(ctx context.Context, tx *sql.Tx, id *int64, statusID int64) (*float64, error) {
	if id == nil {
		return nil, nil
	}
	var pos float64
	var sid int64
	err := tx.QueryRowContext(ctx, `SELECT board_pos, status_id FROM task WHERE id = ? AND deleted_at IS NULL`, *id).Scan(&pos, &sid)
	if err == sql.ErrNoRows {
		return nil, invalid("neighbour task %d does not exist", *id)
	}
	if err != nil {
		return nil, err
	}
	if sid != statusID {
		return nil, invalid("neighbour task %d is not in the target column", *id)
	}
	return &pos, nil
}

// dropPosition works out board_pos for a card landing between beforeID and
// afterID in statusID, renormalising the column if the gap is too small.
func dropPosition(ctx context.Context, tx *sql.Tx, taskID, statusID int64, beforeID, afterID *int64) (float64, error) {
	if beforeID == nil && afterID == nil {
		return endOfColumn(ctx, tx, statusID)
	}
	for attempt := 0; attempt < 2; attempt++ {
		before, err := neighbourPos(ctx, tx, beforeID, statusID)
		if err != nil {
			return 0, err
		}
		after, err := neighbourPos(ctx, tx, afterID, statusID)
		if err != nil {
			return 0, err
		}
		if pos, ok := midpoint(before, after); ok {
			return pos, nil
		}
		if err := renormalise(ctx, tx, statusID, taskID); err != nil {
			return 0, err
		}
	}
	return 0, invalid("before_id and after_id are not adjacent")
}
