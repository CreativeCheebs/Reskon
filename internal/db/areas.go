package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var areaColumns = columns{
	"name":                   kText,
	"key_prefix":             kText,
	"color":                  kTextNull,
	"default_energy_type_id": kIntNull,
	"position":               kInt,
}

// Key prefixes are short upper-case codes: PER, OM2, FRL.
var keyPrefixRe = regexp.MustCompile(`^[A-Z][A-Z0-9]{0,9}$`)

func normaliseAreaFields(f Fields) error {
	if raw, ok := f["key_prefix"]; ok && !isNull(raw) {
		var p string
		if err := json.Unmarshal(raw, &p); err != nil {
			return invalid("key_prefix must be a string")
		}
		p = strings.ToUpper(strings.TrimSpace(p))
		if !keyPrefixRe.MatchString(p) {
			return invalid("key_prefix must be 1-10 letters or digits, starting with a letter")
		}
		f["key_prefix"], _ = json.Marshal(p)
	}
	return nil
}

// CreateArea adds an area and the board view that goes with it
// ("one view per area" in spec section 7).
func (d *DB) CreateArea(ctx context.Context, f Fields) (*Area, error) {
	if err := normaliseAreaFields(f); err != nil {
		return nil, err
	}
	if _, ok := f["name"]; !ok {
		return nil, invalid("name is required")
	}
	if _, ok := f["key_prefix"]; !ok {
		return nil, invalid("key_prefix is required")
	}
	cols, vals, err := f.decode(areaColumns)
	if err != nil {
		return nil, err
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO area (%s) VALUES (%s)`,
		strings.Join(cols, ","), placeholders(len(cols))), vals...)
	if err != nil {
		return nil, uniqueAsConflict(err, "an area with that name or key prefix already exists")
	}
	id, _ := res.LastInsertId()

	var name string
	tx.QueryRowContext(ctx, `SELECT name FROM area WHERE id = ?`, id).Scan(&name)
	filter := fmt.Sprintf(`{"areas":[%d],"statuses":null,"difficulty_min":null,"custom":null,"include_done_days":7}`, id)
	if _, err := tx.ExecContext(ctx, `INSERT INTO view (name, layout, filter, card_config, position)
		VALUES (?, 'board', ?, '{}', ?)`, name, filter, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetArea(ctx, id)
}

func (d *DB) PatchArea(ctx context.Context, id int64, f Fields) (*Area, error) {
	if err := normaliseAreaFields(f); err != nil {
		return nil, err
	}
	if err := d.patchRow(ctx, "area", id, f, areaColumns); err != nil {
		return nil, err
	}
	return d.GetArea(ctx, id)
}

// DeleteArea soft-deletes an area. An area that still has tasks cannot be
// deleted: every task needs exactly one area.
func (d *DB) DeleteArea(ctx context.Context, id int64) error {
	var n int
	if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM task WHERE area_id = ? AND deleted_at IS NULL`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return &ConflictError{Msg: fmt.Sprintf("area has %d tasks; move them to another area first", n)}
	}
	return d.inTx(ctx, func(tx *sql.Tx) error { return softDeleteNamed(ctx, tx, "area", id) })
}

// patchRow applies f to one non-deleted row of table. Table names are
// constants from this package, never user input.
func (d *DB) patchRow(ctx context.Context, table string, id int64, f Fields, spec columns) error {
	cols, vals, err := f.decode(spec)
	if err != nil {
		return err
	}
	if len(cols) == 0 {
		return d.exists(ctx, table, id)
	}
	sets := make([]string, len(cols))
	for i, c := range cols {
		sets[i] = c + " = ?"
	}
	vals = append(vals, id)
	res, err := d.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET %s WHERE id = ? AND deleted_at IS NULL`,
		table, strings.Join(sets, ", ")), vals...)
	if err != nil {
		return uniqueAsConflict(err, "that name is already in use")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// insertRow inserts f into table and returns the new id.
func (d *DB) insertRow(ctx context.Context, table string, f Fields, spec columns) (int64, error) {
	cols, vals, err := f.decode(spec)
	if err != nil {
		return 0, err
	}
	if len(cols) == 0 {
		return 0, invalid("no fields given")
	}
	res, err := d.ExecContext(ctx, fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s)`,
		table, strings.Join(cols, ","), placeholders(len(cols))), vals...)
	if err != nil {
		return 0, uniqueAsConflict(err, "that name is already in use")
	}
	return res.LastInsertId()
}

func (d *DB) softDelete(ctx context.Context, table string, id int64) error {
	res, err := d.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, table), Now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (d *DB) exists(ctx context.Context, table string, id int64) error {
	var one int
	err := d.QueryRowContext(ctx, fmt.Sprintf(`SELECT 1 FROM %s WHERE id = ? AND deleted_at IS NULL`, table), id).Scan(&one)
	if err != nil {
		return ErrNotFound
	}
	return nil
}

// uniqueAsConflict turns a UNIQUE violation into a ConflictError and leaves
// every other error (including NOT NULL / CHECK failures) as an InvalidError.
func uniqueAsConflict(err error, msg string) error {
	s := err.Error()
	switch {
	case strings.Contains(s, "UNIQUE constraint failed"):
		return &ConflictError{Msg: msg}
	case strings.Contains(s, "constraint failed"):
		return invalid("%s", s)
	}
	return err
}
