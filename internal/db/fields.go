package db

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
)

// Fields is a JSON object from a create or PATCH body, keyed by column name.
// A key that is absent is left alone; a key set to null clears the column.
type Fields map[string]json.RawMessage

// fieldKind says how one column's JSON value is decoded and checked.
type fieldKind int

const (
	kText        fieldKind = iota // non-empty string, required if present
	kTextNull                     // string or null
	kInt                          // integer, not null
	kIntNull                      // integer or null
	kReal                         // number, not null
	kRealNull                     // number or null
	kBool                         // true/false, stored 0/1
	kJSONObject                   // JSON object, stored as text
)

// columns maps column name to kind. Only columns listed can be written.
type columns map[string]fieldKind

func isNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

// decode converts f into column names and values in a stable order,
// rejecting unknown keys and wrongly typed values.
func (f Fields) decode(spec columns) ([]string, []any, error) {
	var cols []string
	var vals []any
	for _, name := range sortedKeys(f) {
		raw := f[name]
		kind, ok := spec[name]
		if !ok {
			return nil, nil, invalid("field %q cannot be set", name)
		}
		v, err := decodeValue(name, kind, raw)
		if err != nil {
			return nil, nil, err
		}
		cols = append(cols, name)
		vals = append(vals, v)
	}
	return cols, vals, nil
}

func decodeValue(name string, kind fieldKind, raw json.RawMessage) (any, error) {
	null := isNull(raw)
	switch kind {
	case kText, kTextNull:
		if null {
			if kind == kText {
				return nil, invalid("%s is required", name)
			}
			return nil, nil
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return nil, invalid("%s must be a string", name)
		}
		s = strings.TrimSpace(s)
		if kind == kText && s == "" {
			return nil, invalid("%s is required", name)
		}
		if kind == kTextNull && s == "" {
			return nil, nil
		}
		return s, nil
	case kInt, kIntNull:
		if null {
			if kind == kInt {
				return nil, invalid("%s is required", name)
			}
			return nil, nil
		}
		var n int64
		if err := json.Unmarshal(raw, &n); err != nil {
			return nil, invalid("%s must be an integer", name)
		}
		return n, nil
	case kReal, kRealNull:
		if null {
			if kind == kReal {
				return nil, invalid("%s is required", name)
			}
			return nil, nil
		}
		var x float64
		if err := json.Unmarshal(raw, &x); err != nil {
			return nil, invalid("%s must be a number", name)
		}
		return x, nil
	case kBool:
		var b bool
		if err := json.Unmarshal(raw, &b); err != nil {
			return nil, invalid("%s must be true or false", name)
		}
		if b {
			return 1, nil
		}
		return 0, nil
	case kJSONObject:
		var m map[string]any
		if null || json.Unmarshal(raw, &m) != nil {
			return nil, invalid("%s must be a JSON object", name)
		}
		return string(raw), nil
	}
	return nil, invalid("field %q has no kind", name)
}

// int64Field reads an optional integer field; ok is false when absent or null.
func (f Fields) int64Field(name string) (n int64, ok bool, err error) {
	raw, present := f[name]
	if !present || isNull(raw) {
		return 0, false, nil
	}
	if err := json.Unmarshal(raw, &n); err != nil {
		return 0, false, invalid("%s must be an integer", name)
	}
	return n, true, nil
}

// stringField reads an optional string field; ok is false when absent or null.
func (f Fields) stringField(name string) (s string, ok bool, err error) {
	raw, present := f[name]
	if !present || isNull(raw) {
		return "", false, nil
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", false, invalid("%s must be a string", name)
	}
	return s, true, nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
