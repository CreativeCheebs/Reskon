package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// ViewFilter is a view's filter JSON. A nil field means "no constraint".
type ViewFilter struct {
	Areas           []int64                    `json:"areas"`
	Statuses        []int64                    `json:"statuses"`
	DifficultyMin   *int64                     `json:"difficulty_min"`
	Custom          map[string]json.RawMessage `json:"custom"`
	IncludeDoneDays *int64                     `json:"include_done_days"` // done tasks finished within N days only
	OpenOnly        bool                       `json:"open_only"`         // hide done and cancelled
	Types           []string                   `json:"types"`             // "task", "epic"
	Epics           []int64                    `json:"epics"`             // tasks in these epics; 0 means "no epic"
	Tags            []int64                    `json:"tags"`              // tasks with any of these tags; 0 means "no tags"
	Subtasks        bool                       `json:"subtasks"`          // a view shows subtasks as their own cards only when true
	Not             []string                   `json:"not"`               // lists above read "is not": areas, statuses, types, epics, tags

	parent       *int64 // the subtasks of one task; never from a view's JSON
	hideSubtasks bool   // set for views from Subtasks
}

// negatable lists the filter lists that can read "is not" (the "not" key).
var negatable = map[string]bool{"areas": true, "statuses": true, "types": true, "epics": true, "tags": true}

// not wraps a condition for list field name: when the view says "is not"
// for it, the condition is inverted. A task with no value for the field
// (no epic, no tags) does not match the positive condition, so it is kept.
func (f *ViewFilter) not(name, cond string) string {
	for _, n := range f.Not {
		if n == name {
			return "NOT COALESCE((" + cond + "), 0)"
		}
	}
	return cond
}

// customKeyRe limits custom field keys to identifiers, so they can be put
// in a JSON path safely.
var customKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// parseFilter decodes and checks a filter. Unknown keys are rejected so a
// typo does not silently match everything.
func parseFilter(raw []byte) (*ViewFilter, error) {
	var f ViewFilter
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&f); err != nil {
		return nil, invalid("filter: %v", err)
	}
	for _, t := range f.Types {
		if t != "task" && t != "epic" {
			return nil, invalid("filter: types may only contain task and epic")
		}
	}
	for _, n := range f.Not {
		if !negatable[n] {
			return nil, invalid("filter: not may only contain areas, statuses, types, epics and tags (got %q)", n)
		}
	}
	for k, v := range f.Custom {
		if !customKeyRe.MatchString(k) {
			return nil, invalid("filter: custom key %q is not a valid field key", k)
		}
		if _, _, err := customCondition(k, v); err != nil {
			return nil, err
		}
	}
	return &f, nil
}

// customCondition turns one custom filter entry into SQL. A scalar means
// equality; an object may carry "gte" and/or "lte" bounds (for dates and
// numbers); null means the key is unset.
func customCondition(key string, raw json.RawMessage) (string, []any, error) {
	if !customKeyRe.MatchString(key) {
		return "", nil, invalid("filter: custom %q is not a field key", key)
	}
	// The key is written into the SQL (it can only be letters, digits and
	// _), so the query matches the field's index (customFieldIndexes).
	expr := customExpr(key)
	if isNull(raw) {
		return expr + ` IS NULL`, nil, nil
	}
	var bounds map[string]json.RawMessage
	if json.Unmarshal(raw, &bounds) == nil {
		var conds []string
		var args []any
		for _, op := range sortedKeys(bounds) {
			sqlOp := map[string]string{"gte": ">=", "lte": "<="}[op]
			if sqlOp == "" {
				return "", nil, invalid("filter: custom %s: unknown operator %q", key, op)
			}
			v, err := jsonScalar(bounds[op])
			if err != nil {
				return "", nil, invalid("filter: custom %s: %v", key, err)
			}
			conds = append(conds, expr+` `+sqlOp+` ?`)
			args = append(args, v)
		}
		if len(conds) == 0 {
			return "1", nil, nil // an empty range constrains nothing
		}
		return strings.Join(conds, " AND "), args, nil
	}
	v, err := jsonScalar(raw)
	if err != nil {
		return "", nil, invalid("filter: custom %s: %v", key, err)
	}
	return expr + ` = ?`, []any{v}, nil
}

// jsonScalar converts a JSON scalar to the value json_extract would return:
// true/false become 1/0.
func jsonScalar(raw json.RawMessage) (any, error) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	switch x := v.(type) {
	case bool:
		if x {
			return 1, nil
		}
		return 0, nil
	case string, float64:
		return x, nil
	}
	return nil, fmt.Errorf("value must be a string, number or boolean")
}

// ListTasks returns every non-deleted task with derived values.
func (d *DB) ListTasks(ctx context.Context) ([]*Task, error) {
	return d.queryTasks(ctx, &ViewFilter{}, "", d.Now(ctx))
}

// ListTasksOfType returns every task of one type ("task" or "epic").
func (d *DB) ListTasksOfType(ctx context.Context, typ string) ([]*Task, error) {
	if typ != "task" && typ != "epic" {
		return nil, invalid("type must be task or epic")
	}
	return d.queryTasks(ctx, &ViewFilter{Types: []string{typ}}, "", d.Now(ctx))
}

// ListEpicTasks returns the tasks that belong to one epic.
func (d *DB) ListEpicTasks(ctx context.Context, epicID int64) ([]*Task, error) {
	return d.queryTasks(ctx, &ViewFilter{Epics: []int64{epicID}}, "", d.Now(ctx))
}

// ListTasksForView resolves a view's filter server-side, narrowed by an
// optional search over title, key and description.
func (d *DB) ListTasksForView(ctx context.Context, viewID int64, search string) ([]*Task, error) {
	v, err := d.GetView(ctx, viewID)
	if err != nil {
		return nil, err
	}
	f, err := parseFilter(v.Filter)
	if err != nil {
		return nil, err
	}
	f.hideSubtasks = !f.Subtasks
	return d.queryTasks(ctx, f, search, d.Now(ctx))
}

func (d *DB) queryTasks(ctx context.Context, f *ViewFilter, search string, now time.Time) ([]*Task, error) {
	where := []string{"deleted_at IS NULL"}
	var args []any
	if f.Areas != nil {
		where = append(where, f.not("areas", inList("area_id", f.Areas, &args)))
	}
	if f.Statuses != nil {
		where = append(where, f.not("statuses", inList("status_id", f.Statuses, &args)))
	}
	if f.Types != nil {
		ph := make([]string, len(f.Types))
		for i, t := range f.Types {
			ph[i] = "?"
			args = append(args, t)
		}
		if len(f.Types) == 0 {
			where = append(where, f.not("types", "0"))
		} else {
			where = append(where, f.not("types", "type IN ("+strings.Join(ph, ",")+")"))
		}
	}
	if f.Epics != nil {
		var ids []int64
		none := false
		for _, e := range f.Epics {
			if e == 0 {
				none = true
			} else {
				ids = append(ids, e)
			}
		}
		var conds []string
		if len(ids) > 0 {
			conds = append(conds, inList("epic_id", ids, &args))
		}
		if none {
			conds = append(conds, "epic_id IS NULL")
		}
		if len(conds) == 0 {
			conds = []string{"0"}
		}
		where = append(where, f.not("epics", "("+strings.Join(conds, " OR ")+")"))
	}
	if f.Tags != nil {
		var ids []int64
		none := false
		for _, g := range f.Tags {
			if g == 0 {
				none = true
			} else {
				ids = append(ids, g)
			}
		}
		var conds []string
		if len(ids) > 0 {
			conds = append(conds, "id IN (SELECT task_id FROM task_tag WHERE "+inList("tag_id", ids, &args)+")")
		}
		if none {
			conds = append(conds, "NOT EXISTS (SELECT 1 FROM task_tag WHERE task_id = task.id)")
		}
		if len(conds) == 0 {
			conds = []string{"0"}
		}
		where = append(where, f.not("tags", "("+strings.Join(conds, " OR ")+")"))
	}
	if f.hideSubtasks {
		where = append(where, "parent_id IS NULL")
	}
	if f.parent != nil {
		where = append(where, "parent_id = ?")
		args = append(args, *f.parent)
	}
	if words := strings.Fields(search); len(words) > 0 {
		// Every word must appear in the title, key or description.
		for _, w := range words {
			like := "%" + likeEscape(w) + "%"
			where = append(where, `(title LIKE ? ESCAPE '\' OR key LIKE ? ESCAPE '\' OR COALESCE(description, '') LIKE ? ESCAPE '\')`)
			args = append(args, like, like, like)
		}
	}
	if f.DifficultyMin != nil {
		where = append(where, "difficulty >= ?")
		args = append(args, *f.DifficultyMin)
	}
	for _, k := range sortedKeys(f.Custom) {
		cond, a, err := customCondition(k, f.Custom[k])
		if err != nil {
			return nil, err
		}
		where = append(where, cond)
		args = append(args, a...)
	}
	q := `SELECT ` + taskCols + ` FROM task WHERE ` + strings.Join(where, " AND ") + ` ORDER BY status_id, board_pos`
	tasks, err := collect(ctx, d, q, func(r *sql.Rows) (*Task, error) { return scanTask(r) }, args...)
	if err != nil {
		return nil, err
	}
	if err := d.derive(ctx, tasks, now); err != nil {
		return nil, err
	}

	// Filters on derived values run after derivation.
	out := tasks[:0]
	for _, t := range tasks {
		switch t.Behaviour {
		case "done":
			if f.OpenOnly {
				continue
			}
			if f.IncludeDoneDays != nil && t.CompletedAt != nil &&
				hoursSince(*t.CompletedAt, now) > float64(*f.IncludeDoneDays)*24 {
				continue
			}
		case "cancelled":
			if f.OpenOnly {
				continue
			}
		}
		out = append(out, t)
	}
	return out, nil
}

// inList returns "col IN (?,?)" and appends ids to args. An empty list
// matches nothing ("IN ()" is a syntax error in SQLite).
func inList(col string, ids []int64, args *[]any) string {
	if len(ids) == 0 {
		return "0"
	}
	for _, id := range ids {
		*args = append(*args, id)
	}
	return fmt.Sprintf("%s IN (%s)", col, placeholders(len(ids)))
}

// likeEscape makes s match literally inside a LIKE pattern.
func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// TaskBrief is what a task picker needs, without the derived values.
type TaskBrief struct {
	ID           int64   `json:"id"`
	Key          string  `json:"key"`
	Title        string  `json:"title"`
	Type         string  `json:"type"`
	AreaID       int64   `json:"area_id"`
	EnergyTypeID *int64  `json:"energy_type_id"`
	Difficulty   *int64  `json:"difficulty"`
	Behaviour    string  `json:"behaviour"`
	ParentID     *int64  `json:"parent_id"`
	TagIDs       []int64 `json:"tag_ids"` // its tags, by name, so a session form can show what it will inherit
}

// ListTaskBriefs returns every task, newest first, for pickers (Log time,
// capture, bulk attach). A fraction of the size of the full list.
func (d *DB) ListTaskBriefs(ctx context.Context) ([]*TaskBrief, error) {
	briefs, err := collect(ctx, d, `SELECT t.id, t.key, t.title, t.type, t.area_id, t.energy_type_id, t.difficulty, c.behaviour, t.parent_id FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL ORDER BY t.id DESC`,
		func(r *sql.Rows) (*TaskBrief, error) {
			b := &TaskBrief{TagIDs: []int64{}}
			return b, r.Scan(&b.ID, &b.Key, &b.Title, &b.Type, &b.AreaID, &b.EnergyTypeID, &b.Difficulty, &b.Behaviour, &b.ParentID)
		})
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]*TaskBrief, len(briefs))
	for _, b := range briefs {
		byID[b.ID] = b
	}
	err = scanInto(ctx, d, `SELECT tt.task_id, tt.tag_id FROM task_tag tt JOIN tag g ON g.id = tt.tag_id
		ORDER BY g.name COLLATE NOCASE`, func(r *sql.Rows) error {
		var tid, gid int64
		if err := r.Scan(&tid, &gid); err != nil {
			return err
		}
		if b := byID[tid]; b != nil {
			b.TagIDs = append(b.TagIDs, gid)
		}
		return nil
	})
	return briefs, err
}
