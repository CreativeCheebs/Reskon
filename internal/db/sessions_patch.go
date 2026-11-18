package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

// PatchSession updates a session. The session table has no updated_at, so
// edits are last-write-wins (see SPEC.md 4.15). Points are worked out
// again, at today's rates, when an edit changes what they depend on: hours,
// intensity, energy types or shares, or task (Change 002). Otherwise they
// stay as stored, even if a rate has changed since, unless the patch says
// "recalculate": true. Points sent explicitly are stored as sent.
func (d *DB) PatchSession(ctx context.Context, id int64, f Fields) (*Session, error) {
	subtypes, hasSubtypes, err := parseSubtypes(f)
	if err != nil {
		return nil, err
	}
	energies, hasEnergies, err := parseEnergies(f)
	if err != nil {
		return nil, err
	}
	tagNames, hasTags, err := parseTags(f)
	if err != nil {
		return nil, err
	}
	recalcAsked := takeRecalculate(f)
	_, typeSet := f["energy_type_id"]
	_, diffSet := f["difficulty"]
	_, pointsSet := f["points"]
	customPatch, hasCustom := f["custom"]
	delete(f, "custom")
	delete(f, "updated_at") // tolerated from clients that send it everywhere
	if err := validateSessionFields(f); err != nil {
		return nil, err
	}
	cols, vals, err := f.decode(sessionColumns)
	if err != nil {
		return nil, err
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	cur, err := scanSession(tx.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM session WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := loadEnergies(ctx, tx, []*Session{cur}); err != nil {
		return nil, err
	}
	if err := checkMergedTimes(cur, f); err != nil {
		return nil, err
	}
	if raw, ok := f["day_item_id"]; ok && !isNull(raw) {
		var item int64
		_ = json.Unmarshal(raw, &item) // decode above already accepted it as an integer
		var kind string
		var itemTask sql.NullInt64
		err := tx.QueryRowContext(ctx, `SELECT kind, task_id FROM day_item WHERE id = ? AND deleted_at IS NULL`, item).Scan(&kind, &itemTask)
		if err == sql.ErrNoRows {
			return nil, invalid("plan item %d does not exist", item)
		}
		if err != nil {
			return nil, err
		}
		if kind == "task" {
			// The line must belong to the session's task (after the patch); with
			// no task yet, the line's task is filled in.
			merged := cur.TaskID
			if sent, ok, _ := f.int64Field("task_id"); ok {
				merged = &sent
			} else if raw, has := f["task_id"]; has && isNull(raw) {
				merged = nil
			}
			if merged != nil && *merged != itemTask.Int64 {
				return nil, invalid("plan item %d is for task %d, not task %d", item, itemTask.Int64, *merged)
			}
			if merged == nil {
				f["task_id"], _ = json.Marshal(itemTask.Int64)
				cols, vals = append(cols, "task_id"), append(vals, itemTask.Int64)
			}
		}
	}
	if hasCustom {
		merged, err := d.mergeCustom(ctx, tx, "session", string(cur.Custom), customPatch)
		if err != nil {
			return nil, err
		}
		cols, vals = append(cols, "custom"), append(vals, merged)
	}

	// What the energy parts become, and whether anything points depend on
	// changed.
	next := energies
	if !hasEnergies {
		next = nextParts(cur, f, typeSet, diffSet)
	}
	energyChanged := partsDiffer(cur.Energies, next)
	changed := energyChanged || hoursChanged(cur, f) || taskChanged(cur, f)

	if len(cols) > 0 {
		sets := make([]string, len(cols))
		for i, c := range cols {
			sets[i] = c + " = ?"
		}
		if _, err := tx.ExecContext(ctx, `UPDATE session SET `+strings.Join(sets, ", ")+` WHERE id = ?`,
			append(vals, id)...); err != nil {
			return nil, uniqueAsConflict(err, "conflict")
		}
	}
	if hasTags {
		if err := setSessionTags(ctx, tx, id, tagNames); err != nil {
			return nil, err
		}
	}
	if hasSubtypes {
		if err := writeSubtypes(ctx, tx, id, subtypes); err != nil {
			return nil, err
		}
	}
	if energyChanged {
		if err := writeEnergies(ctx, tx, id, next, nil); err != nil {
			return nil, err
		}
	}
	switch {
	case pointsSet:
		var total *float64
		if err := tx.QueryRowContext(ctx, `SELECT points FROM session WHERE id = ?`, id).Scan(&total); err != nil {
			return nil, err
		}
		if err := rescaleEnergyPoints(ctx, tx, id, total); err != nil {
			return nil, err
		}
	case changed || recalcAsked:
		if err := recalcPoints(ctx, tx, id); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetSession(ctx, id)
}
