package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// Create, edit and delete for the user-editable lookup tables.
// is_builtin is never writable from outside.

var statusColumns = columns{
	"name":             kText,
	"category_id":      kInt,
	"color":            kTextNull,
	"on_board":         kBool,
	"alert_after_days": kIntNull,
	"position":         kInt,
}

var statusCategoryColumns = columns{
	"name":      kText,
	"behaviour": kText,
}

var priorityColumns = columns{
	"name":     kText,
	"color":    kTextNull,
	"weight":   kReal,
	"position": kInt,
}

var energyTypeColumns = columns{
	"name":            kText,
	"color":           kTextNull,
	"position":        kInt,
	"points_per_hour": kReal,
}

var subtypeColumns = columns{
	"name":           kText,
	"energy_type_id": kInt,
	"position":       kInt,
}

// ---------- statuses ----------

func (d *DB) GetStatus(ctx context.Context, id int64) (*Status, error) {
	s, err := scanStatus(d.QueryRowContext(ctx, `SELECT `+statusCols+` FROM status WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &s, err
}

func (d *DB) CreateStatus(ctx context.Context, f Fields) (*Status, error) {
	id, err := d.insertRow(ctx, "status", f, statusColumns)
	if err != nil {
		return nil, err
	}
	return d.GetStatus(ctx, id)
}

func (d *DB) PatchStatus(ctx context.Context, id int64, f Fields) (*Status, error) {
	if err := d.patchRow(ctx, "status", id, f, statusColumns); err != nil {
		return nil, err
	}
	return d.GetStatus(ctx, id)
}

// DeleteStatus soft-deletes a status. Built-in statuses cannot be deleted.
// If tasks are in it, reassignTo is required: each task moves there, gets
// a status_transition row with reason 'status_deleted', and has updated_at
// bumped — all in one transaction, so the move is in the history like any
// other and time in status restarts.
func (d *DB) DeleteStatus(ctx context.Context, id int64, reassignTo *int64) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var builtin bool
	err = tx.QueryRowContext(ctx, `SELECT is_builtin FROM status WHERE id = ? AND deleted_at IS NULL`, id).Scan(&builtin)
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if builtin {
		return &ConflictError{Msg: "built-in statuses cannot be deleted"}
	}

	taskIDs, err := collect(ctx, tx, `SELECT id FROM task WHERE status_id = ? AND deleted_at IS NULL ORDER BY board_pos, id`,
		func(r *sql.Rows) (id int64, err error) {
			err = r.Scan(&id)
			return
		}, id)
	if err != nil {
		return err
	}
	if len(taskIDs) > 0 {
		if reassignTo == nil {
			return &ConflictError{
				Msg:     fmt.Sprintf("status has %d tasks; choose a status to move them to (reassign_to)", len(taskIDs)),
				Current: map[string]int{"task_count": len(taskIDs)},
			}
		}
		if *reassignTo == id {
			return invalid("reassign_to must be a different status")
		}
		if err := statusExists(ctx, tx, *reassignTo); err != nil {
			return err
		}
		pos, err := endOfColumn(ctx, tx, *reassignTo)
		if err != nil {
			return err
		}
		now := Now()
		from := id
		for i, tid := range taskIDs {
			if _, err := tx.ExecContext(ctx, `UPDATE task SET status_id = ?, board_pos = ?, updated_at = ? WHERE id = ?`,
				*reassignTo, pos+float64(i), now, tid); err != nil {
				return err
			}
			if err := writeTransition(ctx, tx, tid, &from, *reassignTo, "status_deleted", now); err != nil {
				return err
			}
			if err := applyDateRules(ctx, tx, tid, *reassignTo, todayOr("")); err != nil {
				return err
			}
			// The same follow-ups as a move (transitions.go).
			if err := wakeIfFinished(ctx, tx, tid, *reassignTo); err != nil {
				return err
			}
		}
		if err := releaseUnblocked(ctx, tx); err != nil {
			return err
		}
	}
	if err := softDeleteNamed(ctx, tx, "status", id); err != nil {
		return err
	}
	return tx.Commit()
}

// ---------- status categories ----------

func (d *DB) CreateStatusCategory(ctx context.Context, f Fields) (*StatusCategory, error) {
	id, err := d.insertRow(ctx, "status_category", f, statusCategoryColumns)
	if err != nil {
		return nil, err
	}
	return d.getStatusCategory(ctx, id)
}

func (d *DB) PatchStatusCategory(ctx context.Context, id int64, f Fields) (*StatusCategory, error) {
	// status_category has no deleted_at; update directly.
	cols, vals, err := f.decode(statusCategoryColumns)
	if err != nil {
		return nil, err
	}
	// One change: if a later field is refused, the earlier ones are not kept.
	err = d.inTx(ctx, func(tx *sql.Tx) error {
		for i, c := range cols {
			if _, err := tx.ExecContext(ctx, `UPDATE status_category SET `+c+` = ? WHERE id = ?`, vals[i], id); err != nil {
				return uniqueAsConflict(err, "that name is already in use")
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return d.getStatusCategory(ctx, id)
}

// DeleteStatusCategory removes a non-builtin category that no status uses.
// Categories have no deleted_at column, so this is a real delete; with no
// statuses pointing at it, nothing references the row.
func (d *DB) DeleteStatusCategory(ctx context.Context, id int64) error {
	c, err := d.getStatusCategory(ctx, id)
	if err != nil {
		return err
	}
	if c.IsBuiltin {
		return &ConflictError{Msg: "built-in categories cannot be deleted"}
	}
	var n int
	if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM status WHERE category_id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return &ConflictError{Msg: fmt.Sprintf("%d statuses use this category", n)}
	}
	_, err = d.ExecContext(ctx, `DELETE FROM status_category WHERE id = ?`, id)
	return err
}

func (d *DB) getStatusCategory(ctx context.Context, id int64) (*StatusCategory, error) {
	var c StatusCategory
	err := d.QueryRowContext(ctx, `SELECT id, name, behaviour, is_builtin FROM status_category WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Behaviour, &c.IsBuiltin)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &c, err
}

// ---------- priorities ----------

func (d *DB) getPriority(ctx context.Context, id int64) (*Priority, error) {
	var p Priority
	err := d.QueryRowContext(ctx, `SELECT id, name, color, weight, position, is_builtin FROM priority
		WHERE id = ? AND deleted_at IS NULL`, id).Scan(&p.ID, &p.Name, &p.Color, &p.Weight, &p.Position, &p.IsBuiltin)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &p, err
}

func (d *DB) CreatePriority(ctx context.Context, f Fields) (*Priority, error) {
	id, err := d.insertRow(ctx, "priority", f, priorityColumns)
	if err != nil {
		return nil, err
	}
	return d.getPriority(ctx, id)
}

func (d *DB) PatchPriority(ctx context.Context, id int64, f Fields) (*Priority, error) {
	if err := d.patchRow(ctx, "priority", id, f, priorityColumns); err != nil {
		return nil, err
	}
	return d.getPriority(ctx, id)
}

// DeletePriority follows the status pattern: tasks using it are moved to
// reassignTo, or cleared (priority_id NULL) when clear is set.
func (d *DB) DeletePriority(ctx context.Context, id int64, reassignTo *int64, clear bool) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var builtin bool
	err = tx.QueryRowContext(ctx, `SELECT is_builtin FROM priority WHERE id = ? AND deleted_at IS NULL`, id).Scan(&builtin)
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if builtin {
		return &ConflictError{Msg: "built-in priorities cannot be deleted"}
	}
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM task WHERE priority_id = ? AND deleted_at IS NULL`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		var target any
		switch {
		case reassignTo != nil:
			if *reassignTo == id {
				return invalid("reassign_to must be a different priority")
			}
			var one int
			if tx.QueryRowContext(ctx, `SELECT 1 FROM priority WHERE id = ? AND deleted_at IS NULL`, *reassignTo).Scan(&one) != nil {
				return invalid("priority %d does not exist", *reassignTo)
			}
			target = *reassignTo
		case clear:
			target = nil
		default:
			return &ConflictError{
				Msg:     fmt.Sprintf("priority is used by %d tasks; pass reassign_to or clear=true", n),
				Current: map[string]int{"task_count": n},
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE task SET priority_id = ?, updated_at = ?
			WHERE priority_id = ? AND deleted_at IS NULL`, target, Now(), id); err != nil {
			return err
		}
	}
	if err := softDeleteNamed(ctx, tx, "priority", id); err != nil {
		return err
	}
	return tx.Commit()
}

// ---------- energy types and subtypes ----------

func (d *DB) getEnergyType(ctx context.Context, id int64) (*EnergyType, error) {
	var e EnergyType
	err := d.QueryRowContext(ctx, `SELECT id, name, color, position, points_per_hour FROM energy_type
		WHERE id = ? AND deleted_at IS NULL`, id).Scan(&e.ID, &e.Name, &e.Color, &e.Position, &e.PointsPerHour)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &e, err
}

// checkRate keeps a points rate at zero or above.
func checkRate(f Fields) error {
	if raw, ok := f["points_per_hour"]; ok {
		var v float64
		if json.Unmarshal(raw, &v) != nil || v < 0 {
			return invalid("points_per_hour must be 0 or more")
		}
	}
	return nil
}

func (d *DB) CreateEnergyType(ctx context.Context, f Fields) (*EnergyType, error) {
	if err := checkRate(f); err != nil {
		return nil, err
	}
	// direction is a NOT NULL column from before Change 001. Nothing reads
	// it; a new type gets a filler value.
	f["direction"] = json.RawMessage(`"spend"`)
	cols := columns{"direction": kText}
	for k, v := range energyTypeColumns {
		cols[k] = v
	}
	id, err := d.insertRow(ctx, "energy_type", f, cols)
	if err != nil {
		return nil, err
	}
	return d.getEnergyType(ctx, id)
}

func (d *DB) PatchEnergyType(ctx context.Context, id int64, f Fields) (*EnergyType, error) {
	if err := checkRate(f); err != nil {
		return nil, err
	}
	if err := d.patchRow(ctx, "energy_type", id, f, energyTypeColumns); err != nil {
		return nil, err
	}
	return d.getEnergyType(ctx, id)
}

func (d *DB) getSubtype(ctx context.Context, id int64) (*Subtype, error) {
	var s Subtype
	err := d.QueryRowContext(ctx, `SELECT id, name, energy_type_id, position FROM subtype
		WHERE id = ? AND deleted_at IS NULL`, id).Scan(&s.ID, &s.Name, &s.EnergyTypeID, &s.Position)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &s, err
}

func (d *DB) CreateSubtype(ctx context.Context, f Fields) (*Subtype, error) {
	id, err := d.insertRow(ctx, "subtype", f, subtypeColumns)
	if err != nil {
		return nil, err
	}
	return d.getSubtype(ctx, id)
}

func (d *DB) PatchSubtype(ctx context.Context, id int64, f Fields) (*Subtype, error) {
	if err := d.patchRow(ctx, "subtype", id, f, subtypeColumns); err != nil {
		return nil, err
	}
	return d.getSubtype(ctx, id)
}

// ---------- helpers ----------

// softDeleteNamed soft-deletes a row whose name is UNIQUE, renaming it to
// "name [deleted #id]" so the name can be used again by a new row.
func softDeleteNamed(ctx context.Context, tx *sql.Tx, table string, id int64) error {
	res, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET deleted_at = ?, name = name || ' [deleted #' || id || ']'
		WHERE id = ? AND deleted_at IS NULL`, table), Now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (d *DB) inTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
