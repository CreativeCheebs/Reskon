package db

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"log"
	"math"
	"sort"
	"strings"
	"sync"

	"jitterbug/internal/embed"
)

// Duplicate search: the tasks whose titles match what is being typed, by
// words, by meaning, or both, so a new task is not a copy of an old one.
// Word matching always runs. Meaning matching runs when the embedding
// model is loaded: title vectors are cached in task_embedding and made
// again whenever a title changes. When many are missing (the first search,
// an import) they are made in the background and the search answers with
// what it has.

// Embedder makes a unit-length meaning vector for a text.
type Embedder interface {
	Embed(text string) []float32
}

// SimilarTask is one match. Words and Meaning say what matched.
type SimilarTask struct {
	ID        int64   `json:"id"`
	Key       string  `json:"key"`
	Title     string  `json:"title"`
	Type      string  `json:"type"`
	StatusID  int64   `json:"status_id"`
	Behaviour string  `json:"behaviour"`
	Score     float64 `json:"score"`
	Words     bool    `json:"words"`
	Meaning   bool    `json:"meaning"`
}

// SimilarResult is the matches plus how far meaning search has got:
// "off" (no model), "indexing" (some titles still without a vector) or
// "ready".
type SimilarResult struct {
	Results  []SimilarTask `json:"results"`
	Semantic string        `json:"semantic"`
	Indexed  int           `json:"indexed"`
	Total    int           `json:"total"`
}

// Thresholds, tuned on 235 real titles. Without the model a title matches
// when it covers most of the query's words. With it, shared words alone
// are not enough ("fix bank issue" shares two words with "Fix sync issues
// with my server"): the meaning has to agree a little too, unless nearly
// every word matches. Meaning alone matches from 0.5, which finds
// paraphrases ("stomach acid" -> "heartburn diagnosis", 0.56) and leaves
// out titles that are merely on the same topic (about 0.3 to 0.45).
const (
	wordMatchMin    = 0.6
	wordStrongMin   = 0.85
	meaningMatchMin = 0.5
	meaningAgreeMin = 0.35
	embedInline     = 8 // missing vectors made during the request; more go to the background
)

// indexing marks databases with a background run going.
var indexing sync.Map // *DB -> struct{}

// SimilarTasks finds up to limit tasks like q, leaving out exclude (the
// task being edited, or 0).
func (d *DB) SimilarTasks(ctx context.Context, q string, m Embedder, limit int, exclude int64) (*SimilarResult, error) {
	out := &SimilarResult{Results: []SimilarTask{}, Semantic: "off"}
	q = strings.TrimSpace(q)
	if len([]rune(q)) < 3 {
		return out, nil
	}
	rows, err := collect(ctx, d, `SELECT t.id, t.key, t.title, t.type, t.status_id, c.behaviour FROM task t
		JOIN status s ON s.id = t.status_id JOIN status_category c ON c.id = s.category_id
		WHERE t.deleted_at IS NULL AND t.id <> ?`,
		func(r *sql.Rows) (*SimilarTask, error) {
			s := &SimilarTask{}
			return s, r.Scan(&s.ID, &s.Key, &s.Title, &s.Type, &s.StatusID, &s.Behaviour)
		}, exclude)
	if err != nil {
		return nil, err
	}
	out.Total = len(rows)

	var qv []float32
	vecs := map[int64][]float32{}
	if m != nil {
		cached, err := d.cachedVectors(ctx)
		if err != nil {
			return nil, err
		}
		var missing []*SimilarTask
		for _, t := range rows {
			if c, ok := cached[t.ID]; ok && c.hash == textHash(t.Title) {
				vecs[t.ID] = c.vec
			} else {
				missing = append(missing, t)
			}
		}
		if len(missing) <= embedInline {
			for _, t := range missing {
				v := m.Embed(t.Title)
				if err := d.storeVector(ctx, t.ID, t.Title, v); err != nil {
					return nil, err
				}
				vecs[t.ID] = v
			}
			missing = nil
		} else {
			d.indexInBackground(m)
		}
		out.Indexed = len(vecs)
		out.Semantic = "ready"
		if len(missing) > 0 {
			out.Semantic = "indexing"
		}
		qv = m.Embed(q)
	}

	qw := wordsOf(q)
	for _, t := range rows {
		ws, exact := wordScore(qw, wordsOf(t.Title))
		t.Words = ws >= wordMatchMin && exact
		score := ws
		if v, ok := vecs[t.ID]; ok && qv != nil {
			cos := float64(embed.Cosine(qv, v))
			t.Meaning = cos >= meaningMatchMin
			if t.Words && cos < meaningAgreeMin && ws < wordStrongMin {
				t.Words = false
			}
			// Meaning leads; shared words lift a title that has both.
			score = math.Max(cos, 0.6*cos+0.4*ws)
		}
		if !t.Words && !t.Meaning {
			continue
		}
		t.Score = math.Round(score*1000) / 1000
		out.Results = append(out.Results, *t)
	}
	sort.SliceStable(out.Results, func(i, j int) bool { return out.Results[i].Score > out.Results[j].Score })
	if len(out.Results) > limit {
		out.Results = out.Results[:limit]
	}
	return out, nil
}

type cachedVector struct {
	hash string
	vec  []float32
}

func (d *DB) cachedVectors(ctx context.Context) (map[int64]cachedVector, error) {
	out := map[int64]cachedVector{}
	err := scanInto(ctx, d, `SELECT task_id, text_hash, vector FROM task_embedding WHERE model = ?`, func(r *sql.Rows) error {
		var id int64
		var c cachedVector
		var b []byte
		if err := r.Scan(&id, &c.hash, &b); err != nil {
			return err
		}
		if len(b) != embed.Dim*4 {
			return nil // a damaged row is made again
		}
		c.vec = make([]float32, embed.Dim)
		for i := range c.vec {
			c.vec[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
		}
		out[id] = c
		return nil
	}, embed.ModelName)
	return out, err
}

func (d *DB) storeVector(ctx context.Context, taskID int64, title string, v []float32) error {
	b := make([]byte, len(v)*4)
	for i, x := range v {
		binary.LittleEndian.PutUint32(b[i*4:], math.Float32bits(x))
	}
	_, err := d.ExecContext(ctx, `INSERT INTO task_embedding (task_id, model, text_hash, vector) VALUES (?, ?, ?, ?)
		ON CONFLICT (task_id) DO UPDATE SET model = excluded.model, text_hash = excluded.text_hash, vector = excluded.vector`,
		taskID, embed.ModelName, textHash(title), b)
	return err
}

// indexInBackground makes every missing or stale vector, one run per
// database at a time.
func (d *DB) indexInBackground(m Embedder) {
	if _, busy := indexing.LoadOrStore(d, struct{}{}); busy {
		return
	}
	go func() {
		defer indexing.Delete(d)
		ctx := context.Background()
		cached, err := d.cachedVectors(ctx)
		if err != nil {
			log.Printf("semantic index: %v", err)
			return
		}
		todo, err := collect(ctx, d, `SELECT id, title FROM task WHERE deleted_at IS NULL`, func(r *sql.Rows) (*SimilarTask, error) {
			t := &SimilarTask{}
			return t, r.Scan(&t.ID, &t.Title)
		})
		if err != nil {
			log.Printf("semantic index: %v", err)
			return
		}
		n := 0
		for _, t := range todo {
			if c, ok := cached[t.ID]; ok && c.hash == textHash(t.Title) {
				continue
			}
			if err := d.storeVector(ctx, t.ID, t.Title, m.Embed(t.Title)); err != nil {
				log.Printf("semantic index: %v", err)
				return
			}
			n++
		}
		if n > 0 {
			log.Printf("semantic index: %d titles", n)
		}
	}()
}

func textHash(s string) string {
	h := sha1.Sum([]byte(s))
	return hex.EncodeToString(h[:8])
}
