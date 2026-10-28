package db

import (
	"context"
	"encoding/json"
)

// mergeCustom applies patch (a JSON object) on top of existing custom JSON.
// Keys in patch overwrite; a null value removes the key. Keys not in patch
// are kept untouched, including keys with no definition.
func (d *DB) mergeCustom(ctx context.Context, q querier, entity, existing string, patch json.RawMessage) (string, error) {
	var cur map[string]json.RawMessage
	if err := json.Unmarshal([]byte(existing), &cur); err != nil || cur == nil {
		cur = map[string]json.RawMessage{}
	}
	var p map[string]json.RawMessage
	if err := json.Unmarshal(patch, &p); err != nil {
		return "", invalid("custom must be a JSON object")
	}
	for k, v := range p {
		if isNull(v) {
			delete(cur, k)
			continue
		}
		cur[k] = v
	}
	out, err := json.Marshal(cur)
	return string(out), err
}
