package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// Deleting something that other rows use works the same for every kind, as
// in Jira: if nothing uses it, it goes. If something does, the delete is
// refused with what uses it, and the client asks where those should move;
// the delete is then sent again with reassign_to and moves them first.
// Nothing is ever left pointing at a deleted row. (Statuses and priorities
// have their own versions in admin.go, older than this file.)

// usage counts what uses a row, as "12 tasks, 3 sessions".
type usage struct {
	parts []string
	total int
}

func (u *usage) add(ctx context.Context, tx *sql.Tx, what, query string, id int64) error {
	var n int
	if err := tx.QueryRowContext(ctx, query, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		word := what
		if n == 1 {
			word = strings.TrimSuffix(what, "s")
		}
		u.parts = append(u.parts, fmt.Sprintf("%d %s", n, word))
		u.total += n
	}
	return nil
}

func (u *usage) conflict(kind string) error {
	text := strings.Join(u.parts, ", ")
	return &ConflictError{
		Msg:     fmt.Sprintf("this %s is used by %s; choose where to move them (reassign_to)", kind, text),
		Current: map[string]any{"used_by": text, "task_count": u.total},
	}
}

func checkTarget(ctx context.Context, tx *sql.Tx, table string, id int64, to *int64) error {
	if *to == id {
		return invalid("reassign_to must be a different one")
	}
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table+` WHERE id = ? AND deleted_at IS NULL`, *to).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return invalid("reassign_to does not exist")
	}
	return nil
}

// DeleteArea deletes an area, moving its tasks and sessions to reassignTo.
func (d *DB) DeleteArea(ctx context.Context, id int64, reassignTo *int64) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		var u usage
		if err := u.add(ctx, tx, "tasks", `SELECT COUNT(*) FROM task WHERE area_id = ? AND deleted_at IS NULL`, id); err != nil {
			return err
		}
		if err := u.add(ctx, tx, "sessions", `SELECT COUNT(*) FROM session WHERE area_id = ? AND deleted_at IS NULL`, id); err != nil {
			return err
		}
		if u.total > 0 {
			if reassignTo == nil {
				return u.conflict("area")
			}
			if err := checkTarget(ctx, tx, "area", id, reassignTo); err != nil {
				return err
			}
			// Keys stay as they are: a key never changes once given.
			if _, err := tx.ExecContext(ctx, `UPDATE task SET area_id = ?, updated_at = ? WHERE area_id = ?`, *reassignTo, Now(), id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE session SET area_id = ? WHERE area_id = ?`, *reassignTo, id); err != nil {
				return err
			}
		}
		return softDeleteNamed(ctx, tx, "area", id)
	})
}

// DeleteEnergyType deletes an energy type, moving everything that uses it to
// reassignTo: tasks, sessions (a session that already has the target type
// gets the two parts joined), subtypes and areas' defaults.
func (d *DB) DeleteEnergyType(ctx context.Context, id int64, reassignTo *int64) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		var u usage
		for _, c := range [][2]string{
			{"tasks", `SELECT COUNT(*) FROM task WHERE energy_type_id = ? AND deleted_at IS NULL`},
			// A session counts if it has a part of this type or is logged under it
			// directly (a one-type session has no parts rows).
			{"sessions", `SELECT COUNT(*) FROM session s WHERE s.deleted_at IS NULL AND (s.energy_type_id = ?1
				OR s.id IN (SELECT session_id FROM session_energy WHERE energy_type_id = ?1))`},
			{"subtypes", `SELECT COUNT(*) FROM subtype WHERE energy_type_id = ? AND deleted_at IS NULL`},
			{"area defaults", `SELECT COUNT(*) FROM area WHERE default_energy_type_id = ? AND deleted_at IS NULL`},
		} {
			if err := u.add(ctx, tx, c[0], c[1], id); err != nil {
				return err
			}
		}
		if u.total > 0 {
			if reassignTo == nil {
				return u.conflict("energy type")
			}
			if err := checkTarget(ctx, tx, "energy_type", id, reassignTo); err != nil {
				return err
			}
			to := *reassignTo
			// A session with both types: the target's part takes the other's
			// share and points, and keeps its own intensity.
			if _, err := tx.ExecContext(ctx, `UPDATE session_energy AS t SET
				share = t.share + (SELECT o.share FROM session_energy o WHERE o.session_id = t.session_id AND o.energy_type_id = ?1),
				points = CASE WHEN t.points IS NULL THEN NULL ELSE t.points + COALESCE((SELECT o.points FROM session_energy o
					WHERE o.session_id = t.session_id AND o.energy_type_id = ?1), 0) END
				WHERE t.energy_type_id = ?2 AND EXISTS (SELECT 1 FROM session_energy o WHERE o.session_id = t.session_id AND o.energy_type_id = ?1)`,
				id, to); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM session_energy WHERE energy_type_id = ?1
				AND session_id IN (SELECT session_id FROM session_energy WHERE energy_type_id = ?2)`, id, to); err != nil {
				return err
			}
			for _, q := range []string{
				`UPDATE session_energy SET energy_type_id = ?1 WHERE energy_type_id = ?2`,
				`UPDATE session SET energy_type_id = ?1 WHERE energy_type_id = ?2`,
				`UPDATE task SET energy_type_id = ?1 WHERE energy_type_id = ?2`,
				`UPDATE subtype SET energy_type_id = ?1 WHERE energy_type_id = ?2`,
				`UPDATE area SET default_energy_type_id = ?1 WHERE default_energy_type_id = ?2`,
			} {
				if _, err := tx.ExecContext(ctx, q, to, id); err != nil {
					return err
				}
			}
		}
		return softDeleteNamed(ctx, tx, "energy_type", id)
	})
}

// DeleteSubtype deletes a subtype, moving the sessions that use it to
// reassignTo (a session that already has the target just loses this one).
func (d *DB) DeleteSubtype(ctx context.Context, id int64, reassignTo *int64) error {
	return d.inTx(ctx, func(tx *sql.Tx) error {
		var u usage
		if err := u.add(ctx, tx, "sessions", `SELECT COUNT(DISTINCT session_id) FROM session_subtype JOIN session s ON s.id = session_id
			WHERE subtype_id = ? AND s.deleted_at IS NULL`, id); err != nil {
			return err
		}
		if u.total > 0 {
			if reassignTo == nil {
				return u.conflict("subtype")
			}
			if err := checkTarget(ctx, tx, "subtype", id, reassignTo); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM session_subtype WHERE subtype_id = ?1
				AND session_id IN (SELECT session_id FROM session_subtype WHERE subtype_id = ?2)`, id, *reassignTo); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE session_subtype SET subtype_id = ?1 WHERE subtype_id = ?2`, *reassignTo, id); err != nil {
				return err
			}
		}
		return softDeleteNamed(ctx, tx, "subtype", id)
	})
}
