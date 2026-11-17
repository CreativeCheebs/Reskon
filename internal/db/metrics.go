package db

import (
	"context"
	"database/sql"
	"sort"
	"strconv"
	"strings"
	"time"
)

// The metrics API (Phase 2 spec section 4): one endpoint, a registry of
// named metrics, no free SQL. Each metric declares its unit and the
// groupings, splits and filters it allows; anything else is rejected.
// Every widget is a metric query plus a visualisation.
//
// Values are computed on read from stored rows. Nothing here is cached or
// stored. Energy types may be added up (everything counts) but never
// subtracted from or divided by one another: no balance, net or rate
// across types exists here.

// MetricQuery is one request: GET /api/metrics?metric=...&group=...
type MetricQuery struct {
	Metric     string              `json:"metric"`
	Group      string              `json:"group"`
	Range      string              `json:"range"` // today, yesterday, 7d, 30d, 90d, 1y, month, all
	From       string              `json:"from"`  // explicit YYYY-MM-DD, overrides range
	To         string              `json:"to"`
	Filters    map[string][]string `json:"filters"`
	Split      string              `json:"split"`
	Reduce     string              `json:"reduce"`     // sum, nonzero, max, last, count
	Cumulative bool                `json:"cumulative"` // running total over time
	Share      bool                `json:"share"`      // also give each value's part of its whole
}

// MetricPoint is one value. Key is a date (day), the week's first day
// (week), YYYY-MM (month) or a row id; Label is what to show for it.
type MetricPoint struct {
	Key    string  `json:"key"`
	Label  string  `json:"label"`
	Value  float64 `json:"value"`
	Split  string  `json:"split,omitempty"`
	Detail string  `json:"detail,omitempty"`
	// Share is Value's part of its whole (0..1), on share queries only: of
	// its group key's total across splits, or with no split, of every key
	// together. It is a part of the sum of all types, never one type
	// divided by another.
	Share *float64 `json:"share,omitempty"`
}

// MetricSeries names one split value, in display order. Total is that
// series alone reduced to one figure (small multiples show it per type;
// series are never added together there).
type MetricSeries struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Color *string `json:"color"`
	Total float64 `json:"total"`
	// Unit is this series' own unit, on a metric that measures two things at
	// once (points and hours); otherwise the metric's unit applies to all.
	Unit string `json:"unit,omitempty"`
	// Average is the series' mean per group key (a dashed reference line).
	Average *float64 `json:"average,omitempty"`
}

// MetricResult is the response. Points is never null: an empty range
// returns [].
type MetricResult struct {
	Metric     string         `json:"metric"`
	Unit       string         `json:"unit"`
	Group      string         `json:"group"`
	From       string         `json:"from"`
	To         string         `json:"to"`
	Ranged     bool           `json:"ranged"` // false: the range was ignored (a current state); a widget does not say it shows dates then
	Points     []MetricPoint  `json:"points"`
	Series     []MetricSeries `json:"series"`
	Reduce     string         `json:"reduce"`
	Cumulative bool           `json:"cumulative,omitempty"` // points are running totals
	Total      float64        `json:"total"`                // the points reduced to one figure
	// Average is the mean of the per-key figures (each day, week or group
	// value, all splits added up), for a dashed reference line. Left out for
	// running totals and for no points.
	Average *float64       `json:"average,omitempty"`
	Spans   []StateSpan    `json:"spans,omitempty"`
	Meta    map[string]any `json:"meta,omitempty"`
}

// StateSpan is one state drawn as a single span across the days it was in
// force, clipped to the range: the bands widget draws a three-week debuff
// as one bar, not 21 labels.
type StateSpan struct {
	StateID           int64   `json:"state_id"`
	Name              string  `json:"name"`
	Kind              string  `json:"kind"`
	From              string  `json:"from"` // first day in force within the range
	To                string  `json:"to"`   // last day in force within the range
	StartedOn         string  `json:"started_on"`
	Cleared           bool    `json:"cleared"`
	Severity          float64 `json:"severity"`           // as entered
	EffectiveSeverity float64 `json:"effective_severity"` // on To
}

// metricDef is one registry entry.
type metricDef struct {
	Name        string   `json:"name"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Unit        string   `json:"unit"`
	Groups      []string `json:"groups"`
	Splits      []string `json:"splits"`
	Filters     []string `json:"filters"`
	Reduce      string   `json:"reduce"` // default reduction
	Ranged      bool     `json:"ranged"` // false: the range is ignored (current state)
	// Unfinished is left out of the catalog, so no new widget can use it,
	// while the code stays for when it is designed (owner, 2026-11-04).
	Unfinished bool `json:"-"`
	// Vizzes, when set, are the only chart types that suit this metric (a
	// metric of two series needs the combined chart); empty means every
	// ordinary chart type.
	Vizzes []string `json:"vizzes,omitempty"`
	run    func(*DB, context.Context, *metricRun) error
}

// VizCombo draws a metric's two series as bars and a line, each on its own
// Y axis (points and hours, which are never added or divided).
const VizCombo = "combo"

var timeGroups = map[string]bool{"day": true, "week": true, "month": true}

// metricRegistry is filled by the metrics_*.go files.
var metricRegistry = map[string]*metricDef{}

func register(m *metricDef) { metricRegistry[m.Name] = m }

// MetricCatalog is GET /api/metrics/catalog: what the widget editor may
// offer, so it can never build a query the server rejects.
type MetricCatalog struct {
	Metrics []*metricDef        `json:"metrics"`
	Vizzes  []string            `json:"vizzes"`
	Ranges  []string            `json:"ranges"`
	Reduces []string            `json:"reduces"`
	Filters map[string][]string `json:"filter_values"` // fixed-value filters
}

// WidgetVizzes are the visualisations a widget may use.
var WidgetVizzes = []string{"bar", "line", "cumulative", "number", "list", "bands", "split_bar", "small_multiples", "table", "pie", "share_bar", VizCombo}

var metricRanges = []string{"today", "yesterday", "7d", "30d", "90d", "1y", "month", "all"}
var metricReduces = []string{"sum", "nonzero", "max", "last", "count"}

func (d *DB) MetricCatalog() *MetricCatalog {
	out := &MetricCatalog{Vizzes: WidgetVizzes, Ranges: metricRanges, Reduces: metricReduces, Filters: map[string][]string{
		"kind": {"task", "event", "buff", "debuff", "modifier"},
	}}
	for _, m := range metricRegistry {
		if !m.Unfinished {
			out.Metrics = append(out.Metrics, m)
		}
	}
	sort.Slice(out.Metrics, func(i, j int) bool { return metricOrder(out.Metrics[i].Name) < metricOrder(out.Metrics[j].Name) })
	return out
}

// metricOrder keeps the catalog in the spec's order.
func metricOrder(name string) int {
	for i, n := range []string{"session_hours", "points", "session_count", "tasks_closed", "tasks_open",
		"points_and_hours", "time_in_status", "cycle_time", "state_days", "days_over_plan", "ceiling_vs_actual", "drift"} {
		if n == name {
			return i
		}
	}
	return 100
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// CheckMetricQuery validates a query's shape against the registry without
// running it. Widgets are checked with it when saved.
func CheckMetricQuery(q *MetricQuery) (*metricDef, error) {
	m, ok := metricRegistry[q.Metric]
	if !ok {
		return nil, invalid("unknown metric %q", q.Metric)
	}
	if q.Group == "" {
		q.Group = m.Groups[0]
	}
	if !contains(m.Groups, q.Group) {
		return nil, invalid("%s cannot be grouped by %q (allowed: %s)", m.Name, q.Group, strings.Join(m.Groups, ", "))
	}
	if q.Split != "" {
		if !contains(m.Splits, q.Split) {
			return nil, invalid("%s cannot be split by %q", m.Name, q.Split)
		}
		if q.Split == q.Group {
			return nil, invalid("split and group are both %q", q.Split)
		}
	}
	for k, v := range q.Filters {
		if len(v) == 0 {
			delete(q.Filters, k)
			continue
		}
		if !contains(m.Filters, k) {
			return nil, invalid("%s cannot be filtered by %q", m.Name, k)
		}
	}
	if q.Reduce != "" && !contains(metricReduces, q.Reduce) {
		return nil, invalid("reduce must be one of %s", strings.Join(metricReduces, ", "))
	}
	if q.From != "" || q.To != "" {
		if !validDate(q.From) || !validDate(q.To) || q.From > q.To {
			return nil, invalid("from and to must both be YYYY-MM-DD, from not after to")
		}
	} else if q.Range != "" && !contains(metricRanges, q.Range) {
		return nil, invalid("range must be one of %s, or from/to", strings.Join(metricRanges, ", "))
	}
	return m, nil
}

// Metric runs one query. now fixes "today" and the time zone that turns
// timestamps into local days.
func (d *DB) Metric(ctx context.Context, q MetricQuery, now time.Time) (*MetricResult, error) {
	m, err := CheckMetricQuery(&q)
	if err != nil {
		return nil, err
	}
	run, err := d.newRun(ctx, m, &q, now)
	if err != nil {
		return nil, err
	}
	if err := m.run(d, ctx, run); err != nil {
		return nil, err
	}
	return run.finish(), nil
}

// ---------- filters ----------

// lookupNames maps id -> name (and colour) for one lookup table, deleted
// rows included so history keeps its labels.
type lookupRow struct {
	name     string
	color    *string
	position int64
	energy   int64 // subtypes only: their energy type
}

func (d *DB) lookupRows(ctx context.Context, query string) (map[int64]*lookupRow, error) {
	out := map[int64]*lookupRow{}
	err := scanInto(ctx, d, query, func(r *sql.Rows) error {
		var id int64
		row := &lookupRow{}
		if err := r.Scan(&id, &row.name, &row.color, &row.position, &row.energy); err != nil {
			return err
		}
		out[id] = row
		return nil
	})
	return out, err
}

// resolveIDs turns filter values (ids, or names matched without case) into
// ids of one lookup.
func resolveIDs(what string, values []string, rows map[int64]*lookupRow) ([]int64, error) {
	var out []int64
	for _, v := range values {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			if _, ok := rows[id]; !ok {
				return nil, invalid("no %s with id %d", what, id)
			}
			out = append(out, id)
			continue
		}
		found := false
		for id, r := range rows {
			if strings.EqualFold(r.name, strings.TrimSpace(v)) {
				out, found = append(out, id), true
			}
		}
		if !found {
			return nil, invalid("no %s named %q", what, v)
		}
	}
	return out, nil
}

func int64Values(name string, values []string) ([]int64, error) {
	out := make([]int64, 0, len(values))
	for _, v := range values {
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return nil, invalid("%s must be ids", name)
		}
		out = append(out, n)
	}
	return out, nil
}
