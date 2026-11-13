package db

import (
	"context"
	"database/sql"
	"sort"
	"strings"

	"jitterbug/internal/capture"
)

// stopwords are skipped when matching capture text to task titles.
var stopwords = map[string]bool{
	"the": true, "and": true, "for": true, "with": true, "my": true, "on": true, "to": true,
	"of": true, "a": true, "an": true, "in": true, "at": true, "hours": true, "hour": true,
	"worked": true, "work": true, "need": true, "did": true, "some": true, "from": true,
	"was": true, "this": true, "that": true, "minutes": true, "mins": true, "hrs": true,
}

func captureWords(text string) []string {
	var out []string
	seen := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	}) {
		if len(w) < 3 || stopwords[w] || seen[w] {
			continue
		}
		seen[w] = true
		out = append(out, w)
	}
	return out
}

// maxCaptureWords is how many distinct words of a note are used to look for
// similar open tasks.
const maxCaptureWords = 40

// maxCaptureLookupTags is how many tag names are offered to the model.
const maxCaptureLookupTags = 200

// CaptureLookups gathers what the model may answer with, including the open
// tasks whose titles share the most words with text (matching happens here,
// in SQLite, not in the model).
func (d *DB) CaptureLookups(ctx context.Context, text string, limit int) (capture.Lookups, error) {
	l := capture.Lookups{Subtypes: map[string][]string{}}
	ets, err := d.ListEnergyTypes(ctx)
	if err != nil {
		return l, err
	}
	etName := map[int64]string{}
	for _, e := range ets {
		l.EnergyTypes = append(l.EnergyTypes, e.Name)
		etName[e.ID] = e.Name
	}
	sts, err := d.ListSubtypes(ctx)
	if err != nil {
		return l, err
	}
	for _, s := range sts {
		n := etName[s.EnergyTypeID]
		l.Subtypes[n] = append(l.Subtypes[n], s.Name)
	}
	areas, err := d.ListAreas(ctx)
	if err != nil {
		return l, err
	}
	for _, a := range areas {
		l.Areas = append(l.Areas, a.Name)
	}
	// Tags are a hint: if they cannot be read, capture goes on without them (it never fails), and a
	// very long list is cut so the prompt stays small.
	if tags, err := d.ListTags(ctx); err == nil {
		for _, t := range tags {
			if len(l.Tags) == maxCaptureLookupTags {
				break
			}
			l.Tags = append(l.Tags, t.Name)
		}
	}

	words := captureWords(text)
	if len(words) == 0 {
		return l, nil
	}
	// The query has one term per word, and SQLite refuses very large
	// expressions. The first words of a note say what it is about.
	if len(words) > maxCaptureWords {
		words = words[:maxCaptureWords]
	}
	// Score = number of distinct words found in the title.
	var score []string
	var args []any
	for _, w := range words {
		score = append(score, "(instr(lower(t.title), ?) > 0)")
		args = append(args, w)
	}
	q := `SELECT t.id, t.key, t.title, t.energy_type_id, ` + strings.Join(score, " + ") + ` AS score
		FROM task t
		JOIN status s ON s.id = t.status_id
		JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND c.behaviour IN ('todo', 'in_progress')`
	type scored struct {
		c     capture.Candidate
		score int
	}
	var all []scored
	err = scanInto(ctx, d, q, func(r *sql.Rows) error {
		var s scored
		if err := r.Scan(&s.c.ID, &s.c.Key, &s.c.Title, &s.c.EnergyTypeID, &s.score); err != nil {
			return err
		}
		if s.c.EnergyTypeID != nil {
			s.c.EnergyType = etName[*s.c.EnergyTypeID]
		}
		if s.score > 0 {
			all = append(all, s)
		}
		return nil
	}, args...)
	if err != nil {
		return l, err
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].score > all[j].score })
	for i := 0; i < len(all) && i < limit; i++ {
		l.Candidates = append(l.Candidates, all[i].c)
	}
	return l, nil
}
