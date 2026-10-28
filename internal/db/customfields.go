package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
)

// Custom fields: values live in task.custom / session.custom as JSON;
// definitions in custom_field tell the UI how to render each key and the
// server how to validate it. No schema change is ever needed.

// validateCustomValue checks one value against its definition's type.
func validateCustomValue(f CustomField, raw json.RawMessage) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return invalid("%s: not valid JSON", f.Key)
	}
	switch f.Type {
	case "text":
		if _, ok := v.(string); !ok {
			return invalid("%s must be text", f.Key)
		}
	case "int":
		n, ok := v.(float64)
		if !ok || n != math.Trunc(n) {
			return invalid("%s must be a whole number", f.Key)
		}
	case "real":
		if _, ok := v.(float64); !ok {
			return invalid("%s must be a number", f.Key)
		}
	case "bool":
		if _, ok := v.(bool); !ok {
			return invalid("%s must be true or false", f.Key)
		}
	case "date":
		s, ok := v.(string)
		if !ok || len(s) != 10 || !validDate(s) {
			return invalid("%s must be a date as YYYY-MM-DD", f.Key)
		}
	case "select":
		s, ok := v.(string)
		if !ok {
			return invalid("%s must be one of its options", f.Key)
		}
		var opts []string
		json.Unmarshal(f.Options, &opts)
		for _, o := range opts {
			if o == s {
				return nil
			}
		}
		return invalid("%s must be one of its options", f.Key)
	}
	return nil
}

// mergeCustom applies patch (a JSON object) on top of existing custom JSON.
// Keys in patch overwrite; a null value removes the key. Keys not in patch
// are kept untouched. Keys with a live definition are validated against
// it; keys with no definition are stored as given and never stripped.
func (d *DB) mergeCustom(ctx context.Context, q querier, entity, existing string, patch json.RawMessage) (string, error) {
	var cur map[string]json.RawMessage
	if err := json.Unmarshal([]byte(existing), &cur); err != nil || cur == nil {
		cur = map[string]json.RawMessage{}
	}
	var p map[string]json.RawMessage
	if err := json.Unmarshal(patch, &p); err != nil {
		return "", invalid("custom must be a JSON object")
	}
	defs, err := customFieldDefs(ctx, q, entity)
	if err != nil {
		return "", err
	}
	for k, v := range p {
		if isNull(v) {
			delete(cur, k)
			continue
		}
		if def, ok := defs[k]; ok {
			if err := validateCustomValue(def, v); err != nil {
				return "", err
			}
		}
		cur[k] = v
	}
	out, err := json.Marshal(cur)
	return string(out), err
}

func customFieldDefs(ctx context.Context, q querier, entity string) (map[string]CustomField, error) {
	defs, err := collect(ctx, q, `SELECT `+customFieldCols+` FROM custom_field WHERE entity = ? AND deleted_at IS NULL`,
		func(r *sql.Rows) (CustomField, error) { return scanCustomField(r) }, entity)
	if err != nil {
		return nil, err
	}
	m := map[string]CustomField{}
	for _, f := range defs {
		m[f.Key] = f
	}
	return m, nil
}

func (d *DB) getCustomField(ctx context.Context, id int64) (*CustomField, error) {
	f, err := scanCustomField(d.QueryRowContext(ctx, `SELECT `+customFieldCols+` FROM custom_field
		WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &f, err
}

var customFieldColumns = columns{
	"entity":   kText,
	"key":      kText,
	"label":    kText,
	"type":     kText,
	"options":  kTextNull, // JSON array, checked below
	"position": kInt,
}

// checkOptions validates and re-encodes a select field's options as a
// JSON array string (the column holds JSON text).
func checkOptions(f Fields) error {
	raw, ok := f["options"]
	if !ok || isNull(raw) {
		return nil
	}
	var opts []string
	if err := json.Unmarshal(raw, &opts); err != nil || len(opts) == 0 {
		return invalid("options must be a non-empty list of strings")
	}
	enc, _ := json.Marshal(opts)
	f["options"], _ = json.Marshal(string(enc))
	return nil
}

func (d *DB) CreateCustomField(ctx context.Context, f Fields) (*CustomField, error) {
	key, _, err := f.stringField("key")
	if err != nil {
		return nil, err
	}
	if !customKeyRe.MatchString(key) {
		return nil, invalid("key must be lower case letters, digits and _, starting with a letter")
	}
	typ, _, _ := f.stringField("type")
	if typ == "select" {
		if raw, ok := f["options"]; !ok || isNull(raw) {
			return nil, invalid("a select field needs options")
		}
	} else {
		delete(f, "options")
	}
	if err := checkOptions(f); err != nil {
		return nil, err
	}
	id, err := d.insertRow(ctx, "custom_field", f, customFieldColumns)
	if err != nil {
		if _, ok := err.(*ConflictError); ok {
			return nil, &ConflictError{Msg: "that key is already used (perhaps by a deleted field, whose data is kept)"}
		}
		return nil, err
	}
	return d.getCustomField(ctx, id)
}

// PatchCustomField may change label, options and position. Key and type
// are immutable: to change a type, create a new field.
func (d *DB) PatchCustomField(ctx context.Context, id int64, f Fields) (*CustomField, error) {
	cur, err := d.getCustomField(ctx, id)
	if err != nil {
		return nil, err
	}
	if k, ok, _ := f.stringField("key"); ok && k != cur.Key {
		return nil, invalid("key cannot change")
	}
	if t, ok, _ := f.stringField("type"); ok && t != cur.Type {
		return nil, invalid("type cannot change; create a new field instead")
	}
	if e, ok, _ := f.stringField("entity"); ok && e != cur.Entity {
		return nil, invalid("entity cannot change")
	}
	delete(f, "key")
	delete(f, "type")
	delete(f, "entity")
	if cur.Type != "select" {
		delete(f, "options")
	}
	if err := checkOptions(f); err != nil {
		return nil, err
	}
	if err := d.patchRow(ctx, "custom_field", id, f, customFieldColumns); err != nil {
		return nil, err
	}
	return d.getCustomField(ctx, id)
}

// DeleteCustomField soft-deletes the definition. Stored values stay in the
// JSON untouched.
func (d *DB) DeleteCustomField(ctx context.Context, id int64) error {
	return d.softDelete(ctx, "custom_field", id)
}
