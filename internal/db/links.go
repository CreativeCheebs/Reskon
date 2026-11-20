package db

import (
	"context"
	"database/sql"
	"fmt"
)

// Dependencies, after Jira's "blocks / is blocked by". A task is blocked
// while any task blocking it is open (not done or cancelled); that is
// derived on read, never stored. Links may not form a loop.

// LinkedTask is the other end of a link, as a task panel lists it.
type LinkedTask struct {
	LinkID    int64   `json:"link_id"`
	ID        int64   `json:"id"`
	Key       string  `json:"key"`
	Title     string  `json:"title"`
	StatusID  int64   `json:"status_id"`
	Behaviour string  `json:"behaviour"`
	RoundNo   *int64  `json:"round_no"`   // its round, if it has one (see rounds.go)
	RoundKind *string `json:"round_kind"` // "round" or "version"
}

func openBehaviour(b string) bool { return b != "done" && b != "cancelled" }

// AddLink records that blocker must finish before blocked. It returns the
// blocked task.
func (d *DB) AddLink(ctx context.Context, blocker, blocked int64) (*Task, error) {
	if blocker == blocked {
		return nil, invalid("a task cannot block itself")
	}
	err := d.inTx(ctx, func(tx *sql.Tx) error {
		for _, id := range []int64{blocker, blocked} {
			if _, err := d.getTask(ctx, tx, id); err == ErrNotFound {
				return invalid("task %d does not exist", id)
			} else if err != nil {
				return err
			}
		}
		// A loop: blocker already waits, directly or not, on blocked.
		loop, err := waitsOn(ctx, tx, blocker, blocked)
		if err != nil {
			return err
		}
		if loop {
			return invalid("that would make a loop: the blocking task already waits on this one")
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO task_link (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`, blocker, blocked, Now())
		if err != nil {
			return uniqueAsConflict(err, "these tasks are already linked")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return d.GetTask(ctx, blocked)
}

// waitsOn reports whether task from is blocked, through any chain of
// links, by task target.
func waitsOn(ctx context.Context, q querier, from, target int64) (bool, error) {
	seen := map[int64]bool{from: true}
	queue := []int64{from}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		var next []int64
		err := scanInto(ctx, q, `SELECT blocker_id FROM task_link WHERE blocked_id = ? AND deleted_at IS NULL`, func(r *sql.Rows) error {
			var b int64
			err := r.Scan(&b)
			next = append(next, b)
			return err
		}, id)
		if err != nil {
			return false, err
		}
		for _, b := range next {
			if b == target {
				return true, nil
			}
			if !seen[b] {
				seen[b] = true
				queue = append(queue, b)
			}
		}
	}
	return false, nil
}

// RemoveLink soft-deletes a link. A task snoozed until unblocked that
// nothing open blocks any more shows again.
func (d *DB) RemoveLink(ctx context.Context, id int64) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE task_link SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, Now(), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return releaseUnblocked(ctx, tx)
	})
}

// openBlockerSQL matches a link whose blocker is a live, open task; it
// expects the link aliased l.
const openBlockerSQL = `l.deleted_at IS NULL AND EXISTS (
	SELECT 1 FROM task b JOIN status s ON s.id = b.status_id JOIN status_category c ON c.id = s.category_id
	WHERE b.id = l.blocker_id AND b.deleted_at IS NULL AND c.behaviour NOT IN ('done', 'cancelled'))`

// releaseUnblocked clears "snooze until unblocked" on every task that
// nothing open blocks any more, so a later link cannot hide it again by
// surprise. It runs after anything that can unblock a task: a move, a
// removed link, a deleted task.
func releaseUnblocked(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `UPDATE task SET snooze_until_unblocked = 0
		WHERE snooze_until_unblocked = 1 AND NOT EXISTS (
			SELECT 1 FROM task_link l WHERE l.blocked_id = task.id AND `+openBlockerSQL+`)`)
	return err
}

// linksOf returns, for tasks among ids, the tasks blocking each one and
// the tasks each one blocks. Deleted tasks and links are left out.
func (d *DB) linksOf(ctx context.Context, ids []any, in string) (blockedBy, blocks map[int64][]LinkedTask, err error) {
	blockedBy, blocks = map[int64][]LinkedTask{}, map[int64][]LinkedTask{}
	query := func(mine, other string, into map[int64][]LinkedTask) error {
		return scanInto(ctx, d, fmt.Sprintf(`SELECT l.%s, l.id, t.id, t.key, t.title, t.status_id, c.behaviour, t.round_no, t.round_kind FROM task_link l
			JOIN task t ON t.id = l.%s AND t.deleted_at IS NULL
			JOIN status s ON s.id = t.status_id
			JOIN status_category c ON c.id = s.category_id
			WHERE l.deleted_at IS NULL AND l.%s IN (%s) ORDER BY l.id`, mine, other, mine, in), func(r *sql.Rows) error {
			var id int64
			var lt LinkedTask
			err := r.Scan(&id, &lt.LinkID, &lt.ID, &lt.Key, &lt.Title, &lt.StatusID, &lt.Behaviour, &lt.RoundNo, &lt.RoundKind)
			into[id] = append(into[id], lt)
			return err
		}, ids...)
	}
	if err = query("blocked_id", "blocker_id", blockedBy); err != nil {
		return
	}
	err = query("blocker_id", "blocked_id", blocks)
	return
}
