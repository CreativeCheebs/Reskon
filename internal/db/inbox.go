package db

import (
	"context"
	"database/sql"
	"strings"
)

// The inbox holds bare lines dropped in with a shortcut, to be turned into
// tasks or sessions later. Writing a line never parses or guesses anything.

// InboxItem is one line waiting in the inbox.
type InboxItem struct {
	ID        int64  `json:"id"`
	Text      string `json:"text"`
	CreatedAt string `json:"created_at"`
}

const maxInboxText = 2000

// ListInbox returns the lines still waiting, oldest first.
func (d *DB) ListInbox(ctx context.Context) ([]*InboxItem, error) {
	return collect(ctx, d, `SELECT id, text, created_at FROM inbox_item
		WHERE triaged_at IS NULL AND deleted_at IS NULL ORDER BY created_at, id`,
		func(r *sql.Rows) (*InboxItem, error) {
			it := &InboxItem{}
			return it, r.Scan(&it.ID, &it.Text, &it.CreatedAt)
		})
}

// AddInbox puts a line in the inbox.
func (d *DB) AddInbox(ctx context.Context, text string) (*InboxItem, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, invalid("text is required")
	}
	if len(text) > maxInboxText {
		return nil, invalid("at most %d characters", maxInboxText)
	}
	it := &InboxItem{Text: text, CreatedAt: Now()}
	res, err := d.ExecContext(ctx, `INSERT INTO inbox_item (text, created_at) VALUES (?, ?)`, it.Text, it.CreatedAt)
	if err != nil {
		return nil, err
	}
	it.ID, _ = res.LastInsertId()
	return it, nil
}

// TriageInbox marks a line as dealt with: it became a task or a session.
func (d *DB) TriageInbox(ctx context.Context, id int64) error {
	return d.closeInbox(ctx, id, "triaged_at")
}

// DiscardInbox soft-deletes a line.
func (d *DB) DiscardInbox(ctx context.Context, id int64) error {
	return d.closeInbox(ctx, id, "deleted_at")
}

func (d *DB) closeInbox(ctx context.Context, id int64, col string) error {
	res, err := d.ExecContext(ctx, `UPDATE inbox_item SET `+col+` = ?
		WHERE id = ? AND triaged_at IS NULL AND deleted_at IS NULL`, Now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
