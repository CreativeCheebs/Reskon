package db

import (
	"context"
	"database/sql"
	"strings"
)

// SessionQuery narrows ListSessions. Zero values mean no constraint.
type SessionQuery struct {
	From, To string // logged_for range, inclusive, YYYY-MM-DD
	TaskID   int64
}

func (d *DB) ListSessions(ctx context.Context, q SessionQuery) ([]*Session, error) {
	where := []string{"deleted_at IS NULL"}
	var args []any
	if q.From != "" {
		where, args = append(where, "logged_for >= ?"), append(args, q.From)
	}
	if q.To != "" {
		where, args = append(where, "logged_for <= ?"), append(args, q.To)
	}
	if q.TaskID != 0 {
		where, args = append(where, "task_id = ?"), append(args, q.TaskID)
	}
	sessions, err := collect(ctx, d, `SELECT `+sessionCols+` FROM session WHERE `+strings.Join(where, " AND ")+
		` ORDER BY logged_for DESC, created_at DESC`, func(r *sql.Rows) (*Session, error) { return scanSession(r) }, args...)
	if err != nil {
		return nil, err
	}
	return sessions, d.attachSubtypes(ctx, sessions)
}
