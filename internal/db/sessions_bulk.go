package db

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Fields a bulk change may set on many sessions at once. Hours, notes,
// labels and subtypes stay per-session edits.
var bulkSessionColumns = columns{
	"energy_type_id": kInt,
	"kind":           kText,
	"area_id":        kIntNull,
	"difficulty":     kIntNull,
	"logged_for":     kText,
	"task_id":        kIntNull,
}

// BulkSessions applies one change to many sessions in a single
// transaction: either set fields on all of them, or delete them all. If any
// id is missing (or already deleted), nothing changes. Returns how many
// sessions were changed.
//
// Detaching from a task (task_id null) keeps the task's title as the
// session's label when it has none, so the row never goes blank. Attaching
// to a task takes the task's area unless area_id is also set.
//
// A third action, addTags, adds tags (by name, made if new) to every selected
// session and keeps the tags they already have. It is exclusive with set and
// delete and never touches points.
//
// Points are stored afresh at today's rates when the change is to energy
// type, intensity or task, or when set is just {"recalculate": true}
// (Change 002).
func (d *DB) BulkSessions(ctx context.Context, ids []int64, set Fields, del bool, addTags []string) (int, error) {
	if len(ids) == 0 {
		return 0, invalid("no sessions selected")
	}
	adding := addTags != nil
	if adding {
		if del || len(set) > 0 {
			return 0, invalid("give exactly one of fields to set, delete, or tags to add")
		}
		var names []string
		seen := map[string]bool{}
		for _, n := range addTags {
			c, err := cleanTagName(n)
			if err != nil {
				return 0, err
			}
			if k := strings.ToLower(c); !seen[k] {
				seen[k] = true
				names = append(names, c)
			}
		}
		if len(names) == 0 {
			return 0, invalid("give at least one tag name to add")
		}
		if len(names) > maxTagsPerItem {
			return 0, invalid("at most %d tags", maxTagsPerItem)
		}
		addTags = names
	}
	recalc := takeRecalculate(set)
	for _, k := range []string{"energy_type_id", "difficulty", "task_id"} {
		if _, ok := set[k]; ok {
			recalc = true
		}
	}
	if adding {
		recalc = false
	}
	if recalc && del {
		return 0, invalid("give either fields to set or delete, not both or neither")
	}
	if recalc && len(set) == 0 {
		set = Fields{}
	}
	if !adding && del == (len(set) > 0 || recalc) {
		return 0, invalid("give either fields to set or delete, not both or neither")
	}
	seen := map[int64]bool{}
	var uniq []int64
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			uniq = append(uniq, id)
		}
	}
	var args []any
	in := inList("id", uniq, &args)

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var found int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM session WHERE deleted_at IS NULL AND `+in, args...).Scan(&found); err != nil {
		return 0, err
	}
	if found != len(uniq) {
		return 0, &ConflictError{Msg: fmt.Sprintf("%d of the %d selected sessions no longer exist; reload and try again", len(uniq)-found, len(uniq))}
	}

	if adding {
		tagIDs, err := ensureTags(ctx, tx, addTags)
		if err != nil {
			return 0, err
		}
		for _, id := range uniq {
			for _, tg := range tagIDs {
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO session_tag (session_id, tag_id) VALUES (?, ?)`, id, tg); err != nil {
					return 0, err
				}
			}
		}
		var over int
		var tagArgs []any
		tagIn := inList("session_id", uniq, &tagArgs)
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM (SELECT session_id FROM session_tag WHERE `+tagIn+` GROUP BY session_id HAVING COUNT(*) > ?)`, append(tagArgs, maxTagsPerItem)...).Scan(&over); err != nil {
			return 0, err
		}
		if over > 0 {
			return 0, invalid("a session can have at most %d tags", maxTagsPerItem)
		}
		return len(uniq), tx.Commit()
	}

	if del {
		if _, err := tx.ExecContext(ctx, `UPDATE session SET deleted_at = ? WHERE `+in, append([]any{Now()}, args...)...); err != nil {
			return 0, err
		}
		return len(uniq), tx.Commit()
	}

	if err := validateSessionFields(set); err != nil {
		return 0, err
	}
	var detach bool
	if raw, ok := set["task_id"]; ok {
		if isNull(raw) {
			detach = true
		} else {
			var taskID int64
			if json.Unmarshal(raw, &taskID) != nil {
				return 0, invalid("task_id must be an integer")
			}
			var areaID int64
			if err := tx.QueryRowContext(ctx, `SELECT area_id FROM task WHERE id = ? AND deleted_at IS NULL`, taskID).Scan(&areaID); err != nil {
				return 0, invalid("task %d does not exist", taskID)
			}
			if _, has := set["area_id"]; !has {
				set["area_id"], _ = json.Marshal(areaID)
			}
		}
	}
	cols, vals, err := set.decode(bulkSessionColumns)
	if err != nil {
		return 0, err
	}
	if detach {
		if _, err := tx.ExecContext(ctx, `UPDATE session SET label = (SELECT title FROM task WHERE task.id = session.task_id)
			WHERE (label IS NULL OR label = '') AND task_id IS NOT NULL AND `+in, args...); err != nil {
			return 0, err
		}
	}
	if len(cols) > 0 {
		sets := make([]string, len(cols))
		for i, c := range cols {
			sets[i] = c + " = ?"
		}
		if _, err := tx.ExecContext(ctx, `UPDATE session SET `+strings.Join(sets, ", ")+` WHERE `+in, append(vals, args...)...); err != nil {
			return 0, uniqueAsConflict(err, "conflict")
		}
	}
	// Sessions with several energy types: one type set for all makes them
	// one-type sessions; an intensity set for all applies to every part.
	var partArgs []any
	partsIn := inList("session_id", uniq, &partArgs)
	if _, ok := set["energy_type_id"]; ok {
		if _, err := tx.ExecContext(ctx, `DELETE FROM session_energy WHERE `+partsIn, partArgs...); err != nil {
			return 0, err
		}
	} else if _, ok := set["difficulty"]; ok {
		if _, err := tx.ExecContext(ctx, `UPDATE session_energy SET difficulty = (SELECT difficulty FROM session WHERE id = session_id) WHERE `+partsIn, partArgs...); err != nil {
			return 0, err
		}
	}
	if recalc {
		for _, id := range uniq {
			if err := recalcPoints(ctx, tx, id); err != nil {
				return 0, err
			}
		}
	}
	return len(uniq), tx.Commit()
}
