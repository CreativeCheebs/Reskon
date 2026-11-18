package db

import (
	"context"
	"database/sql"
	"sort"
	"strings"
	"unicode"
)

// CaptureSuggestion is one line offered under the Quick capture box.
// Kind is "task" (an existing task's title), "session" (a line that was
// captured before and became a session on a task; TaskID is that task) or
// "history" (any other line captured before).
type CaptureSuggestion struct {
	Text   string `json:"text"`
	Kind   string `json:"kind"`
	TaskID *int64 `json:"task_id,omitempty"`
}

const (
	// maxCaptureSuggestions is how many lines are offered at most.
	maxCaptureSuggestions = 8
	// suggestCandidates caps the rows read from each source before ranking.
	suggestCandidates = 400
	// maxSuggestWords is how many typed words are matched.
	maxSuggestWords = 6
)

type suggestCand struct {
	CaptureSuggestion
	closed bool
	count  int
	recent string
}

// CaptureSuggest offers lines for the Quick capture box: task titles that
// match what was typed, and lines captured before. Past lines are not stored
// anywhere of their own: every task and session made by Quick capture keeps
// its line in custom._capture.raw, and this reads them from there. It never
// writes. Fewer than two letters typed offers nothing.
func (d *DB) CaptureSuggest(ctx context.Context, q string) ([]CaptureSuggestion, error) {
	q = strings.ToLower(strings.TrimSpace(q))
	if len([]rune(q)) < 2 {
		return []CaptureSuggestion{}, nil
	}
	words := strings.Fields(q)
	if len(words) > maxSuggestWords {
		words = words[:maxSuggestWords]
	}
	match := func(col string) (string, []any) {
		var conds []string
		var args []any
		for _, w := range words {
			conds = append(conds, "instr(lower("+col+"), ?) > 0")
			args = append(args, w)
		}
		return strings.Join(conds, " AND "), args
	}

	cands := map[string]*suggestCand{} // by lower-cased text
	add := func(c suggestCand) {
		key := strings.ToLower(strings.TrimSpace(c.Text))
		if key == "" {
			return
		}
		old := cands[key]
		if old == nil {
			c.count = 1
			cands[key] = &c
			return
		}
		old.count++
		if c.recent > old.recent {
			old.recent = c.recent
		}
		// A task title is the best home for a line; a session's link to its task beats a bare line.
		rank := map[string]int{"task": 3, "session": 2, "history": 1}
		if rank[c.Kind] > rank[old.Kind] {
			old.Kind, old.TaskID, old.closed = c.Kind, c.TaskID, c.closed
		}
	}

	// Each source keeps its best candidates before ranking: lines that start with
	// what was typed first (and open tasks before closed ones), then the newest,
	// so a cap on many loose matches never drops a line that begins with it.

	// 1. Task titles.
	cond, args := match("t.title")
	err := scanInto(ctx, d, `SELECT t.id, t.title, t.updated_at, c.behaviour IN ('done','cancelled')
		FROM task t JOIN status s ON s.id = t.status_id JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND `+cond+`
		ORDER BY instr(lower(t.title), ?) = 1 DESC, c.behaviour IN ('done','cancelled'), t.updated_at DESC LIMIT ?`, func(r *sql.Rows) error {
		var id int64
		var title, at string
		var closed bool
		if err := r.Scan(&id, &title, &at, &closed); err != nil {
			return err
		}
		add(suggestCand{CaptureSuggestion: CaptureSuggestion{Text: title, Kind: "task", TaskID: &id}, closed: closed, recent: at})
		return nil
	}, append(args, q, suggestCandidates)...)
	if err != nil {
		return nil, err
	}

	// 2. Lines captured before, from sessions then from tasks.
	raw := "json_extract(x.custom, '$._capture.raw')"
	cond, args = match(raw)
	err = scanInto(ctx, d, `SELECT `+raw+`, x.created_at, x.task_id IS NOT NULL AND t.deleted_at IS NULL, x.task_id
		FROM session x LEFT JOIN task t ON t.id = x.task_id
		WHERE x.deleted_at IS NULL AND json_type(x.custom, '$._capture.raw') = 'text' AND `+cond+`
		ORDER BY instr(lower(`+raw+`), ?) = 1 DESC, x.created_at DESC LIMIT ?`,
		func(r *sql.Rows) error {
			var text, at string
			var linked bool
			var taskID sql.NullInt64
			if err := r.Scan(&text, &at, &linked, &taskID); err != nil {
				return err
			}
			c := suggestCand{CaptureSuggestion: CaptureSuggestion{Text: text, Kind: "history"}, recent: at}
			if linked {
				c.Kind, c.TaskID = "session", &taskID.Int64
			}
			add(c)
			return nil
		}, append(args, q, suggestCandidates)...)
	if err != nil {
		return nil, err
	}
	err = scanInto(ctx, d, `SELECT `+raw+`, x.created_at FROM task x
		WHERE x.deleted_at IS NULL AND json_type(x.custom, '$._capture.raw') = 'text' AND `+cond+`
		ORDER BY instr(lower(`+raw+`), ?) = 1 DESC, x.created_at DESC LIMIT ?`,
		func(r *sql.Rows) error {
			var text, at string
			if err := r.Scan(&text, &at); err != nil {
				return err
			}
			add(suggestCand{CaptureSuggestion: CaptureSuggestion{Text: text, Kind: "history"}, recent: at})
			return nil
		}, append(args, q, suggestCandidates)...)
	if err != nil {
		return nil, err
	}

	// Rank: starts with what was typed, then a word starts with it, then it
	// is somewhere inside; open before done; then most repeated, then newest.
	tier := func(text string) int {
		l := strings.ToLower(text)
		if strings.HasPrefix(l, q) {
			return 0
		}
		for _, w := range strings.FieldsFunc(l, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
			if strings.HasPrefix(w, words[0]) {
				return 1
			}
		}
		return 2
	}
	list := make([]*suggestCand, 0, len(cands))
	for _, c := range cands {
		list = append(list, c)
	}
	sort.Slice(list, func(i, j int) bool {
		a, b := list[i], list[j]
		if ta, tb := tier(a.Text), tier(b.Text); ta != tb {
			return ta < tb
		}
		if a.closed != b.closed {
			return !a.closed
		}
		if a.count != b.count {
			return a.count > b.count
		}
		if a.recent != b.recent {
			return a.recent > b.recent
		}
		return a.Text < b.Text
	})
	out := []CaptureSuggestion{}
	for _, c := range list {
		if len(out) == maxCaptureSuggestions {
			break
		}
		out = append(out, c.CaptureSuggestion)
	}
	return out, nil
}
