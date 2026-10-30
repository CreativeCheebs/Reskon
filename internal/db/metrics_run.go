package db

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"time"
)

// metricRun is one query being answered: the resolved range and settings,
// the lookups it needs, and the values accumulated so far.
type metricRun struct {
	def       *metricDef
	q         *MetricQuery
	now       time.Time
	loc       *time.Location
	today     string
	from, to  string
	weekStart int // ISO weekday, 1 = Monday

	areas, energy, subtypes, statuses map[int64]*lookupRow

	direction string // the result's direction: spend, restore or ""
	values    map[[2]string]float64
	labels    map[string]string
	details   map[string]string
	series    map[string]*MetricSeries
	seriesPos map[string]int64
	keyPos    map[string]int64 // sort position for lookup-keyed groups
	spans     []StateSpan
	meta      map[string]any
	sparse    bool // time groups list only keys that have values
}

const dateFmt = "2006-01-02"

func (d *DB) newRun(ctx context.Context, m *metricDef, q *MetricQuery, now time.Time) (*metricRun, error) {
	r := &metricRun{
		def: m, q: q, now: now, loc: now.Location(), today: now.Format(dateFmt),
		values: map[[2]string]float64{}, labels: map[string]string{}, details: map[string]string{},
		series: map[string]*MetricSeries{}, seriesPos: map[string]int64{}, keyPos: map[string]int64{},
	}
	if m.Direction == "spend" {
		r.direction = "spend"
	}
	r.weekStart = 1
	var ws int
	if ok, err := d.Setting(ctx, "week_start", &ws); err == nil && ok && ws >= 1 && ws <= 7 {
		r.weekStart = ws
	}
	var err error
	if r.from, r.to, err = d.resolveRange(ctx, q, r.today); err != nil {
		return nil, err
	}
	if r.areas, err = d.lookupRows(ctx, `SELECT id, name, color, position, '', 0 FROM area`); err != nil {
		return nil, err
	}
	if r.energy, err = d.lookupRows(ctx, `SELECT id, name, color, position, direction, 0 FROM energy_type`); err != nil {
		return nil, err
	}
	if r.subtypes, err = d.lookupRows(ctx, `SELECT s.id, s.name, e.color, e.position * 1000 + s.position, e.direction, s.energy_type_id
		FROM subtype s JOIN energy_type e ON e.id = s.energy_type_id`); err != nil {
		return nil, err
	}
	if r.statuses, err = d.lookupRows(ctx, `SELECT id, name, color, position, '', 0 FROM status`); err != nil {
		return nil, err
	}
	return r, nil
}

// resolveRange turns range (or from/to) into two inclusive local dates.
func (d *DB) resolveRange(ctx context.Context, q *MetricQuery, today string) (string, string, error) {
	if q.From != "" {
		return q.From, q.To, nil
	}
	if q.Range == "" {
		q.Range = "30d"
	}
	switch q.Range {
	case "today":
		return today, today, nil
	case "7d", "30d", "90d":
		n, _ := strconv.Atoi(q.Range[:len(q.Range)-1])
		return addDays(today, -(n - 1)), today, nil
	case "1y":
		return addDays(today, -364), today, nil
	case "month":
		return today[:8] + "01", today, nil
	case "all":
		var first sql.NullString
		err := d.QueryRowContext(ctx, `SELECT MIN(day) FROM (
			SELECT MIN(logged_for) AS day FROM session WHERE deleted_at IS NULL
			UNION ALL SELECT MIN(started_on) FROM state
			UNION ALL SELECT MIN(day) FROM day_plan
			UNION ALL SELECT MIN(substr(created_at, 1, 10)) FROM task WHERE deleted_at IS NULL)`).Scan(&first)
		if err != nil {
			return "", "", err
		}
		if !first.Valid || first.String > today {
			return today, today, nil
		}
		// created_at is UTC; a day early is harmless and never misses one.
		return addDays(first.String, -1), today, nil
	}
	return "", "", invalid("unknown range %q", q.Range)
}

func parseDay(s string) time.Time {
	t, _ := time.Parse(dateFmt, s)
	return t
}

func addDays(day string, n int) string {
	return parseDay(day).AddDate(0, 0, n).Format(dateFmt)
}

// daysBetween is b - a in whole days.
func daysBetween(a, b string) int {
	return int(parseDay(b).Sub(parseDay(a)).Hours() / 24)
}

// localDay is the local date a stored UTC timestamp falls on.
func (r *metricRun) localDay(ts string) string {
	t, err := ParseTime(ts)
	if err != nil {
		return ""
	}
	return t.In(r.loc).Format(dateFmt)
}

// weekOf is the first day of the week holding day, by the week_start setting.
func weekOf(day string, weekStart int) string {
	t := parseDay(day)
	iso := int(t.Weekday())
	if iso == 0 {
		iso = 7
	}
	return t.AddDate(0, 0, -((iso - weekStart + 7) % 7)).Format(dateFmt)
}

// timeKey is the group key of a local date for a time grouping.
func (r *metricRun) timeKey(day string) string {
	switch r.q.Group {
	case "week":
		return weekOf(day, r.weekStart)
	case "month":
		return day[:7]
	}
	return day
}

func (r *metricRun) inRange(day string) bool { return day >= r.from && day <= r.to }

// timeKeys lists every key of the range, oldest first, so empty days show
// as zero rather than missing.
func (r *metricRun) timeKeys() []string {
	var out []string
	seen := map[string]bool{}
	for day := r.from; day <= r.to; day = addDays(day, 1) {
		if k := r.timeKey(day); !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	return out
}

// add accumulates value under a group key and split key ("" if no split).
func (r *metricRun) add(key, split string, value float64) {
	r.values[[2]string{key, split}] += value
}

// label sets what a non-time key shows, and its sort position (lower
// first); keys without a position sort by value, largest first.
func (r *metricRun) label(key, label string, pos *int64) {
	r.labels[key] = label
	if pos != nil {
		r.keyPos[key] = *pos
	}
}

func (r *metricRun) addSeries(key, label string, color *string, pos int64) {
	if _, ok := r.series[key]; !ok {
		r.series[key] = &MetricSeries{Key: key, Label: label, Color: color}
		r.seriesPos[key] = pos
	}
}

// lookupKey labels key from a lookup row, as a group or split value.
func (r *metricRun) lookupKey(kind string, id int64, asSplit bool) string {
	key := strconv.FormatInt(id, 10)
	rows := map[string]map[int64]*lookupRow{"area": r.areas, "energy_type": r.energy, "subtype": r.subtypes, "status": r.statuses}[kind]
	name, pos := fmt.Sprintf("#%d", id), int64(1<<40)
	var color *string
	if row := rows[id]; row != nil {
		name, pos, color = row.name, row.position, row.color
	}
	if id == 0 {
		name = "None"
	}
	if asSplit {
		r.addSeries(key, name, color, pos)
	} else {
		r.label(key, name, &pos)
	}
	return key
}

// finish orders keys, fills empty time slots, applies cumulative and
// reduce, and builds the response.
func (r *metricRun) finish() *MetricResult {
	out := &MetricResult{
		Metric: r.def.Name, Unit: r.def.Unit, Direction: r.direction, Group: r.q.Group,
		From: r.from, To: r.to, Points: []MetricPoint{}, Series: []MetricSeries{},
		Spans: r.spans, Meta: r.meta, Reduce: r.q.Reduce,
	}
	if out.Reduce == "" {
		out.Reduce = r.def.Reduce
	}
	splitKeys := []string{""}
	if r.q.Split != "" {
		splitKeys = splitKeys[:0]
		for k := range r.series {
			splitKeys = append(splitKeys, k)
		}
		sort.Slice(splitKeys, func(i, j int) bool {
			a, b := splitKeys[i], splitKeys[j]
			if r.seriesPos[a] != r.seriesPos[b] {
				return r.seriesPos[a] < r.seriesPos[b]
			}
			return r.series[a].Label < r.series[b].Label
		})
		for _, k := range splitKeys {
			out.Series = append(out.Series, *r.series[k])
		}
	}

	totals := map[string]float64{} // per group key, across splits
	seen := map[string]bool{}
	for k, v := range r.values {
		totals[k[0]] += v
		seen[k[0]] = true
	}
	var keys []string
	if len(seen) == 0 {
		// Nothing in range: [] rather than a row of zeros.
	} else if timeGroups[r.q.Group] && !r.sparse {
		keys = r.timeKeys()
	} else {
		for k := range seen {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool {
			a, b := keys[i], keys[j]
			if timeGroups[r.q.Group] {
				return a < b
			}
			pa, oka := r.keyPos[a]
			pb, okb := r.keyPos[b]
			switch {
			case oka && okb && pa != pb:
				return pa < pb
			case oka != okb:
				return oka
			case !oka && totals[a] != totals[b]:
				return totals[a] > totals[b]
			}
			return r.labels[a] < r.labels[b]
		})
	}

	out.Total = reduce(out.Reduce, keys, totals)

	running := map[string]float64{}
	for _, k := range keys {
		label := r.labels[k]
		if label == "" {
			label = k
		}
		for _, s := range splitKeys {
			v := r.values[[2]string{k, s}]
			if r.q.Cumulative {
				running[s] += v
				v = running[s]
			}
			out.Points = append(out.Points, MetricPoint{Key: k, Label: label, Value: v, Split: s, Detail: r.details[k]})
		}
	}
	return out
}

// reduce turns per-key totals into one figure for number widgets and the
// narrow-screen fallback.
func reduce(how string, keys []string, totals map[string]float64) float64 {
	var out float64
	for i, k := range keys {
		v := totals[k]
		switch how {
		case "nonzero":
			if v != 0 {
				out++
			}
		case "max":
			if i == 0 || v > out {
				out = v
			}
		case "last":
			out = v
		case "count":
			out++
		default: // sum
			out += v
		}
	}
	return out
}
