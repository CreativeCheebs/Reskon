package db

import (
	"encoding/json"
	"strconv"
)

// Some JSON columns hold other rows' ids. Between devices those are uids:
// these walk the known shapes and swap one for the other. An id that has no
// uid (or a uid unknown here) is dropped, never guessed.

type idSwap func(table string, v string) (string, bool)

// syncJSONFields lists, per table, the JSON columns holding ids.
var syncJSONFields = map[string]map[string]func(v any, swap idSwap) any{
	"view": {
		"filter": func(v any, swap idSwap) any {
			m, ok := v.(map[string]any)
			if !ok {
				return v
			}
			swapList(m, "areas", "area", swap)
			swapList(m, "statuses", "status", swap)
			swapList(m, "epics", "task", swap) // 0 = no epic, kept as is
			return m
		},
		"board_state": func(v any, swap idSwap) any {
			m, ok := v.(map[string]any)
			if !ok {
				return v
			}
			swapList(m, "collapsed", "status", swap)
			swapKeys(m, "limits", "status", swap)
			return m
		},
	},
	"day_plan": {
		"ceilings":          func(v any, swap idSwap) any { return swapMapKeys(v, "energy_type", swap) },
		"ceiling_feedback":  func(v any, swap idSwap) any { return swapMapKeys(v, "energy_type", swap) },
		"ceiling_feedbacks": func(v any, swap idSwap) any { return swapMapKeys(v, "energy_type", swap) },
	},
	"widget": {
		"query": func(v any, swap idSwap) any {
			m, ok := v.(map[string]any)
			if !ok {
				return v
			}
			f, ok := m["filters"].(map[string]any)
			if !ok {
				return m
			}
			for name, table := range map[string]string{"area": "area", "energy_type": "energy_type", "subtype": "subtype", "status": "status", "task_id": "task"} {
				list, ok := f[name].([]any)
				if !ok {
					continue
				}
				out := []any{}
				for _, x := range list {
					s, _ := x.(string)
					// Filters may be names too; only ids and uids are swapped.
					if r, ok := swap(table, s); ok {
						out = append(out, r)
					} else if _, err := strconv.ParseInt(s, 10, 64); err != nil && len(s) < 30 {
						out = append(out, s)
					}
				}
				f[name] = out
			}
			return m
		},
	},
}

func swapOne(table string, x any, swap idSwap) (any, bool) {
	var s string
	switch t := x.(type) {
	case float64:
		if t == 0 {
			return x, true
		}
		s = strconv.FormatInt(int64(t), 10)
	case string:
		s = t
	default:
		return x, true
	}
	r, ok := swap(table, s)
	if !ok {
		return nil, false
	}
	// Ids are numbers locally, uids strings between devices.
	if n, err := strconv.ParseInt(r, 10, 64); err == nil {
		return float64(n), true
	}
	return r, true
}

func swapList(m map[string]any, key, table string, swap idSwap) {
	list, ok := m[key].([]any)
	if !ok {
		return
	}
	out := []any{}
	for _, x := range list {
		if r, ok := swapOne(table, x, swap); ok {
			out = append(out, r)
		}
	}
	m[key] = out
}

func swapKeys(m map[string]any, key, table string, swap idSwap) {
	m[key] = swapMapKeys(m[key], table, swap)
}

func swapMapKeys(v any, table string, swap idSwap) any {
	m, ok := v.(map[string]any)
	if !ok {
		return v
	}
	out := map[string]any{}
	for k, x := range m {
		if r, ok := swap(table, k); ok {
			out[r] = x
		}
	}
	return out
}

// swapJSONColumn rewrites the ids inside one JSON column, if it has any.
func swapJSONColumn(table, col string, raw any, swap idSwap) any {
	f := syncJSONFields[table][col]
	s, ok := raw.(string)
	if f == nil || !ok || s == "" {
		return raw
	}
	var v any
	if json.Unmarshal([]byte(s), &v) != nil {
		return raw
	}
	b, err := json.Marshal(f(v, swap))
	if err != nil {
		return raw
	}
	return string(b)
}
