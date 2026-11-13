package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"unicode"
	"unicode/utf16"
)

// Tags are short free words on tasks ("backend", "q4"), beside the area and
// the epic. A task can have several. A session shows the tags of its task as
// they are now, worked out when it is read and never stored, plus the tags
// put on the session by hand, which are the only ones kept for it. So a task's
// tag changes reach its sessions at once and on every device, and a tag put
// on a session by hand stays when the task's tags change.

// Tag is a tag with how many tasks and sessions carry it.
type Tag struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Tasks    int    `json:"task_count"`
	Sessions int    `json:"session_count"`
}

// SessionTag is a tag on a session: from its task (it follows the task), or put on by hand.
type SessionTag struct {
	TagID    int64 `json:"tag_id"`
	FromTask bool  `json:"from_task"`
}

const (
	maxTagLength   = 32 // UTF-16 units, as the screens count
	maxTagsPerItem = 20
)

// cleanTagName trims a tag, folds runs of spaces, drops a leading "#" and
// checks what is left: 1 to 32 characters, no commas or control characters.
func cleanTagName(s string) (string, error) {
	s = strings.TrimLeft(strings.TrimSpace(s), "#")
	s = strings.Join(strings.Fields(s), " ")
	if s == "" {
		return "", invalid("a tag needs a name")
	}
	if len(utf16.Encode([]rune(s))) > maxTagLength {
		return "", invalid("a tag name can have at most %d characters", maxTagLength)
	}
	for _, r := range s {
		if r == ',' || unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return "", invalid("a tag name cannot have commas or hidden characters")
		}
	}
	return s, nil
}

// parseTags reads the "tags" field: a list of tag names. A task or session
// that does not mention it keeps its tags.
func parseTags(f Fields) (names []string, present bool, err error) {
	raw, ok := f["tags"]
	delete(f, "tags")
	if !ok {
		return nil, false, nil
	}
	if isNull(raw) {
		return nil, true, nil
	}
	var in []string
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, true, invalid("tags must be a list of tag names")
	}
	seen := map[string]bool{}
	for _, n := range in {
		c, err := cleanTagName(n)
		if err != nil {
			return nil, true, err
		}
		if k := strings.ToLower(c); !seen[k] {
			seen[k] = true
			names = append(names, c)
		}
	}
	if len(names) > maxTagsPerItem {
		return nil, true, invalid("at most %d tags", maxTagsPerItem)
	}
	return names, true, nil
}

// ensureTags returns the ids of the named tags, making any that do not exist yet.
func ensureTags(ctx context.Context, tx *sql.Tx, names []string) ([]int64, error) {
	ids := make([]int64, 0, len(names))
	for _, n := range names {
		var id int64
		err := tx.QueryRowContext(ctx, `SELECT id FROM tag WHERE name = ? COLLATE NOCASE`, n).Scan(&id)
		if err == sql.ErrNoRows {
			res, err := tx.ExecContext(ctx, `INSERT INTO tag (name, created_at) VALUES (?, ?)`, n, Now())
			if err != nil {
				return nil, err
			}
			id, _ = res.LastInsertId()
		} else if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// replaceLinks makes the rows of a link table (task_tag or session_tag) for one
// owner exactly the wanted tags: extras go, missing ones are added, the rest are untouched.
func replaceLinks(ctx context.Context, tx *sql.Tx, table, ownerCol string, owner int64, want []int64) error {
	have := map[int64]bool{}
	rows, err := tx.QueryContext(ctx, `SELECT tag_id FROM `+table+` WHERE `+ownerCol+` = ?`, owner)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		have[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	wanted := map[int64]bool{}
	for _, id := range want {
		wanted[id] = true
		if !have[id] {
			if _, err := tx.ExecContext(ctx, `INSERT INTO `+table+` (`+ownerCol+`, tag_id) VALUES (?, ?)`, owner, id); err != nil {
				return err
			}
		}
	}
	for id := range have {
		if !wanted[id] {
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE `+ownerCol+` = ? AND tag_id = ?`, owner, id); err != nil {
				return err
			}
		}
	}
	return nil
}

func setTaskTags(ctx context.Context, tx *sql.Tx, taskID int64, names []string) error {
	ids, err := ensureTags(ctx, tx, names)
	if err != nil {
		return err
	}
	return replaceLinks(ctx, tx, "task_tag", "task_id", taskID, ids)
}

// setSessionTags sets the tags put on a session by hand.
func setSessionTags(ctx context.Context, tx *sql.Tx, sessionID int64, names []string) error {
	ids, err := ensureTags(ctx, tx, names)
	if err != nil {
		return err
	}
	return replaceLinks(ctx, tx, "session_tag", "session_id", sessionID, ids)
}

// ListTags lists every tag by name, with how many tasks and sessions have each.
func (d *DB) ListTags(ctx context.Context) ([]Tag, error) {
	out := []Tag{}
	at := map[int64]int{}
	if err := scanInto(ctx, d, `SELECT id, name FROM tag ORDER BY name COLLATE NOCASE`, func(r *sql.Rows) error {
		var t Tag
		if err := r.Scan(&t.ID, &t.Name); err != nil {
			return err
		}
		at[t.ID] = len(out)
		out = append(out, t)
		return nil
	}); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}
	// One pass each, grouped by tag, however many tags and sessions there are.
	if err := scanInto(ctx, d, `SELECT tt.tag_id, COUNT(*) FROM task_tag tt JOIN task k ON k.id = tt.task_id
		WHERE k.deleted_at IS NULL GROUP BY tt.tag_id`, func(r *sql.Rows) error {
		var id int64
		var n int
		if err := r.Scan(&id, &n); err != nil {
			return err
		}
		if i, ok := at[id]; ok {
			out[i].Tasks = n
		}
		return nil
	}); err != nil {
		return nil, err
	}
	// A session counts once for a tag it has by hand, from its task, or both.
	if err := scanInto(ctx, d, `SELECT tag_id, COUNT(*) FROM (
			SELECT st.tag_id AS tag_id, st.session_id AS session_id FROM session_tag st
				JOIN session s ON s.id = st.session_id WHERE s.deleted_at IS NULL
			UNION
			SELECT tt.tag_id, s.id FROM task_tag tt JOIN session s ON s.task_id = tt.task_id WHERE s.deleted_at IS NULL
		) GROUP BY tag_id`, func(r *sql.Rows) error {
		var id int64
		var n int
		if err := r.Scan(&id, &n); err != nil {
			return err
		}
		if i, ok := at[id]; ok {
			out[i].Sessions = n
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateTag makes a tag, or returns the one that already has that name.
func (d *DB) CreateTag(ctx context.Context, name string) (*Tag, error) {
	n, err := cleanTagName(name)
	if err != nil {
		return nil, err
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	ids, err := ensureTags(ctx, tx, []string{n})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.getTag(ctx, ids[0])
}

func (d *DB) getTag(ctx context.Context, id int64) (*Tag, error) {
	tags, err := d.ListTags(ctx)
	if err != nil {
		return nil, err
	}
	for i := range tags {
		if tags[i].ID == id {
			return &tags[i], nil
		}
	}
	return nil, ErrNotFound
}

// RenameTag changes a tag's name everywhere it is used. Another tag may not already have the name.
func (d *DB) RenameTag(ctx context.Context, id int64, name string) (*Tag, error) {
	n, err := cleanTagName(name)
	if err != nil {
		return nil, err
	}
	res, err := d.ExecContext(ctx, `UPDATE tag SET name = ? WHERE id = ?`, n, id)
	if err != nil {
		return nil, uniqueAsConflict(err, "a tag with that name already exists")
	}
	if c, _ := res.RowsAffected(); c == 0 {
		return nil, ErrNotFound
	}
	return d.getTag(ctx, id)
}

// DeleteTag deletes a tag and takes it off every task and session.
func (d *DB) DeleteTag(ctx context.Context, id int64) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		// Explicit, so the links' own sync marks are written; the foreign key's cascade is the backstop.
		for _, t := range []string{"task_tag", "session_tag"} {
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+t+` WHERE tag_id = ?`, id); err != nil {
				return err
			}
		}
		res, err := tx.ExecContext(ctx, `DELETE FROM tag WHERE id = ?`, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// attachTaskTags fills TagIDs on each task: its tags, in name order.
func (d *DB) attachTaskTags(ctx context.Context, tasks []*Task) error {
	if len(tasks) == 0 {
		return nil
	}
	byID := make(map[int64]*Task, len(tasks))
	ids := make([]any, len(tasks))
	for i, t := range tasks {
		t.TagIDs = []int64{}
		byID[t.ID] = t
		ids[i] = t.ID
	}
	return scanInto(ctx, d, `SELECT tt.task_id, tt.tag_id FROM task_tag tt JOIN tag g ON g.id = tt.tag_id
		WHERE tt.task_id IN (`+placeholders(len(ids))+`) ORDER BY g.name COLLATE NOCASE`, func(r *sql.Rows) error {
		var tid, gid int64
		if err := r.Scan(&tid, &gid); err != nil {
			return err
		}
		byID[tid].TagIDs = append(byID[tid].TagIDs, gid)
		return nil
	}, ids...)
}

// attachSessionTags fills Tags on each session: its task's tags as they are now, then the ones put on by hand.
func (d *DB) attachSessionTags(ctx context.Context, sessions []*Session) error {
	byID := make(map[int64]*Session, len(sessions))
	for _, s := range sessions {
		s.Tags = []SessionTag{}
		byID[s.ID] = s
	}
	// In batches, so a long list of sessions never runs into the limit on bound values.
	const batch = 5000
	for start := 0; start < len(sessions); start += batch {
		end := min(start+batch, len(sessions))
		ids := make([]any, 0, end-start)
		for _, s := range sessions[start:end] {
			ids = append(ids, s.ID)
		}
		in := placeholders(len(ids))
		// One row per tag per session; a tag the task has counts as from the task even if it was also put on by hand.
		err := scanInto(ctx, d, `SELECT x.session_id, x.tag_id, x.from_task FROM (
				SELECT s.id AS session_id, tt.tag_id AS tag_id, 1 AS from_task FROM session s
					JOIN task_tag tt ON tt.task_id = s.task_id WHERE s.id IN (`+in+`)
				UNION
				SELECT st.session_id, st.tag_id, 0 FROM session_tag st WHERE st.session_id IN (`+in+`)
					AND NOT EXISTS (SELECT 1 FROM session s2 JOIN task_tag t2 ON t2.task_id = s2.task_id
						WHERE s2.id = st.session_id AND t2.tag_id = st.tag_id)
			) x JOIN tag g ON g.id = x.tag_id ORDER BY x.session_id, x.from_task DESC, g.name COLLATE NOCASE`, func(r *sql.Rows) error {
			var sid, gid int64
			var from bool
			if err := r.Scan(&sid, &gid, &from); err != nil {
				return err
			}
			byID[sid].Tags = append(byID[sid].Tags, SessionTag{TagID: gid, FromTask: from})
			return nil
		}, append(ids, ids...)...)
		if err != nil {
			return err
		}
	}
	return nil
}

// sessionTagCond is the SQL (on a session aliased s) for "has any of these tags, the task's or put
// on by hand"; the tag id 0 means "has no tags at all". The sessions list and the session metrics
// both use it, so a filter means the same in both.
func sessionTagCond(tags []int64, args *[]any) string {
	var ids []int64
	none := false
	for _, g := range tags {
		if g == 0 {
			none = true
		} else {
			ids = append(ids, g)
		}
	}
	var conds []string
	if len(ids) > 0 {
		conds = append(conds, "s.id IN (SELECT session_id FROM session_tag WHERE "+inList("tag_id", ids, args)+")",
			"s.task_id IN (SELECT task_id FROM task_tag WHERE "+inList("tag_id", ids, args)+")")
	}
	if none {
		conds = append(conds, "(NOT EXISTS (SELECT 1 FROM session_tag st WHERE st.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM task_tag tt WHERE tt.task_id = s.task_id))")
	}
	return "(" + strings.Join(conds, " OR ") + ")"
}
