package db

import (
	"context"
	"database/sql"
	"strings"
)

// SessionQuery narrows ListSessions. Zero values mean no constraint.
type SessionQuery struct {
	From, To    string // logged_for range, inclusive, YYYY-MM-DD
	TaskID      int64
	EnergyTypes []int64 // any of these
	Areas       []int64 // any of these
	Kind        string  // "task" or "event"
	HasTask     *bool   // true: attached to a task; false: not attached
	HasDiff     *bool   // true: difficulty set; false: not set
	HasSubtypes *bool   // true: at least one subtype; false: none
	Search      string  // every word in label, note or task title
}

func (d *DB) ListSessions(ctx context.Context, q SessionQuery) ([]*Session, error) {
	where := []string{"s.deleted_at IS NULL"}
	var args []any
	if q.From != "" {
		where, args = append(where, "s.logged_for >= ?"), append(args, q.From)
	}
	if q.To != "" {
		where, args = append(where, "s.logged_for <= ?"), append(args, q.To)
	}
	if q.TaskID != 0 {
		where, args = append(where, "s.task_id = ?"), append(args, q.TaskID)
	}
	if len(q.EnergyTypes) > 0 {
		where = append(where, inList("s.energy_type_id", q.EnergyTypes, &args))
	}
	if len(q.Areas) > 0 {
		where = append(where, inList("s.area_id", q.Areas, &args))
	}
	if q.Kind != "" {
		if q.Kind != "task" && q.Kind != "event" {
			return nil, invalid("kind must be task or event")
		}
		where, args = append(where, "s.kind = ?"), append(args, q.Kind)
	}
	if q.HasTask != nil {
		if *q.HasTask {
			where = append(where, "s.task_id IS NOT NULL")
		} else {
			where = append(where, "s.task_id IS NULL")
		}
	}
	if q.HasDiff != nil {
		if *q.HasDiff {
			where = append(where, "s.difficulty IS NOT NULL")
		} else {
			where = append(where, "s.difficulty IS NULL")
		}
	}
	if q.HasSubtypes != nil {
		exists := "EXISTS (SELECT 1 FROM session_subtype ss WHERE ss.session_id = s.id)"
		if *q.HasSubtypes {
			where = append(where, exists)
		} else {
			where = append(where, "NOT "+exists)
		}
	}
	for _, w := range strings.Fields(q.Search) {
		like := "%" + likeEscape(w) + "%"
		where = append(where, `(COALESCE(s.label,'') LIKE ? ESCAPE '\' OR COALESCE(s.note,'') LIKE ? ESCAPE '\'
			OR COALESCE(t.title,'') LIKE ? ESCAPE '\' OR COALESCE(t.key,'') LIKE ? ESCAPE '\')`)
		args = append(args, like, like, like, like)
	}
	cols := "s." + strings.ReplaceAll(sessionCols, ", ", ", s.")
	sessions, err := collect(ctx, d, `SELECT `+cols+` FROM session s LEFT JOIN task t ON t.id = s.task_id
		WHERE `+strings.Join(where, " AND ")+` ORDER BY s.logged_for DESC, s.created_at DESC`,
		func(r *sql.Rows) (*Session, error) { return scanSession(r) }, args...)
	if err != nil {
		return nil, err
	}
	return sessions, d.attachSubtypes(ctx, sessions)
}
