package db

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
)

// Session metrics: hours, stored points and counts of logged sessions,
// grouped by local day (logged_for), area, energy type or subtype.

func init() {
	sessionFilters := []string{"area", "energy_type", "subtype", "kind", "task_id", "direction"}
	register(&metricDef{
		Name: "session_hours", Label: "Session hours", Unit: "hours", Direction: "from_energy_type",
		Description: "Hours logged. Spend and restore are never mixed: filter by direction or energy type. By subtype, hours are weighted by rank.",
		Groups:      []string{"day", "week", "month", "area", "subtype", "energy_type", "session"},
		Splits:      []string{"area", "subtype", "energy_type"},
		Filters:     sessionFilters, Reduce: "sum", Ranged: true,
		run: func(ctx context.Context, d *DB, r *metricRun) error {
			return d.sessionMetric(ctx, r, func(s *sessionRow) float64 { return s.hours }, true)
		},
	})
	register(&metricDef{
		Name: "work_points", Label: "Work points", Unit: "points", Direction: "spend",
		Description: "Points stored on spend sessions when they were logged (hours × difficulty). By subtype, weighted by rank.",
		Groups:      []string{"day", "week", "month", "area", "subtype"},
		Splits:      []string{"area", "subtype", "energy_type"},
		Filters:     sessionFilters, Reduce: "sum", Ranged: true,
		run: func(ctx context.Context, d *DB, r *metricRun) error {
			return d.sessionMetric(ctx, r, func(s *sessionRow) float64 { return s.points }, true)
		},
	})
	register(&metricDef{
		Name: "session_count", Label: "Sessions", Unit: "count",
		Description: "Number of sessions logged. By subtype, a session counts once for each subtype it has.",
		Groups:      []string{"day", "week", "area", "subtype"},
		Splits:      []string{"area", "subtype", "kind"},
		Filters:     sessionFilters, Reduce: "sum", Ranged: true,
		run: func(ctx context.Context, d *DB, r *metricRun) error {
			return d.sessionMetric(ctx, r, func(*sessionRow) float64 { return 1 }, false)
		},
	})
}

type sessionRow struct {
	id       int64
	day      string
	area     int64 // 0 = none
	energy   int64
	kind     string
	hours    float64
	points   float64 // 0 when none stored
	title    string
	subtypes []sessionSub
}

type sessionSub struct {
	id     int64
	weight float64
}

// energyCandidates is the set of energy types a session query can match
// after its energy_type, direction and subtype filters.
func (r *metricRun) energyCandidates() (map[int64]bool, error) {
	out := map[int64]bool{}
	for id := range r.energy {
		out[id] = true
	}
	if v := r.q.Filters["energy_type"]; len(v) > 0 {
		ids, err := resolveIDs("energy type", v, r.energy)
		if err != nil {
			return nil, err
		}
		keep := map[int64]bool{}
		for _, id := range ids {
			keep[id] = true
		}
		for id := range out {
			if !keep[id] {
				delete(out, id)
			}
		}
	}
	if v := r.q.Filters["direction"]; len(v) > 0 {
		for _, dir := range v {
			if dir != "spend" && dir != "restore" {
				return nil, invalid("direction must be spend or restore")
			}
		}
		for id := range out {
			if !contains(v, r.energy[id].direction) {
				delete(out, id)
			}
		}
	}
	if v := r.q.Filters["subtype"]; len(v) > 0 {
		ids, err := resolveIDs("subtype", v, r.subtypes)
		if err != nil {
			return nil, err
		}
		keep := map[int64]bool{}
		for _, id := range ids {
			keep[r.subtypes[id].energy] = true
		}
		for id := range out {
			if !keep[id] {
				delete(out, id)
			}
		}
	}
	if r.def.Direction == "spend" {
		for id := range out {
			if r.energy[id].direction != "spend" {
				delete(out, id)
			}
		}
	}
	return out, nil
}

// directionOf is the one direction a set of energy types shares, or "".
func (r *metricRun) directionOf(energy map[int64]bool) string {
	dir := ""
	for id := range energy {
		dir = r.energy[id].direction
	}
	return dir
}

// loadSessions reads the sessions in range that pass the query's filters.
func (d *DB) loadSessions(ctx context.Context, r *metricRun, energy map[int64]bool, needSubtypes bool) ([]*sessionRow, error) {
	if len(energy) == 0 {
		return nil, nil
	}
	where := []string{"s.deleted_at IS NULL", "s.logged_for >= ?", "s.logged_for <= ?"}
	args := []any{r.from, r.to}
	ids := make([]int64, 0, len(energy))
	for id := range energy {
		ids = append(ids, id)
	}
	where = append(where, inList("s.energy_type_id", ids, &args))
	if v := r.q.Filters["area"]; len(v) > 0 {
		areas, err := resolveIDs("area", v, r.areas)
		if err != nil {
			return nil, err
		}
		where = append(where, inList("s.area_id", areas, &args))
	}
	if v := r.q.Filters["kind"]; len(v) > 0 {
		for _, k := range v {
			if k != "task" && k != "event" {
				return nil, invalid("a session's kind is task or event")
			}
		}
		where = append(where, "s.kind IN ("+placeholders(len(v))+")")
		for _, k := range v {
			args = append(args, k)
		}
	}
	if v := r.q.Filters["task_id"]; len(v) > 0 {
		tasks, err := int64Values("task_id", v)
		if err != nil {
			return nil, err
		}
		where = append(where, inList("s.task_id", tasks, &args))
	}
	if v := r.q.Filters["subtype"]; len(v) > 0 {
		subs, err := resolveIDs("subtype", v, r.subtypes)
		if err != nil {
			return nil, err
		}
		var subArgs []any
		cond := inList("subtype_id", subs, &subArgs)
		where = append(where, "s.id IN (SELECT session_id FROM session_subtype WHERE "+cond+")")
		args = append(args, subArgs...)
	}
	var out []*sessionRow
	byID := map[int64]*sessionRow{}
	err := scanInto(ctx, d, `SELECT s.id, s.logged_for, COALESCE(s.area_id, 0), s.energy_type_id, s.kind, s.hours,
		COALESCE(s.points, 0), COALESCE(t.title, s.label, '')
		FROM session s LEFT JOIN task t ON t.id = s.task_id
		WHERE `+strings.Join(where, " AND ")+` ORDER BY s.logged_for, s.id`, func(rows *sql.Rows) error {
		s := &sessionRow{}
		if err := rows.Scan(&s.id, &s.day, &s.area, &s.energy, &s.kind, &s.hours, &s.points, &s.title); err != nil {
			return err
		}
		out = append(out, s)
		byID[s.id] = s
		return nil
	}, args...)
	if err != nil || !needSubtypes || len(out) == 0 {
		return out, err
	}
	weights := d.subtypeWeights(ctx)
	err = scanInto(ctx, d, `SELECT ss.session_id, ss.subtype_id, ss.rank FROM session_subtype ss
		JOIN session s ON s.id = ss.session_id
		WHERE s.deleted_at IS NULL AND s.logged_for >= ? AND s.logged_for <= ?
		ORDER BY ss.session_id, ss.rank`, func(rows *sql.Rows) error {
		var sid, sub int64
		var rank int
		if err := rows.Scan(&sid, &sub, &rank); err != nil {
			return err
		}
		if s := byID[sid]; s != nil {
			s.subtypes = append(s.subtypes, sessionSub{id: sub, weight: rankWeight(weights, rank)})
		}
		return nil
	}, r.from, r.to)
	return out, err
}

// keyed is one group or split value a session contributes to, with the
// share of the session it carries (subtype rank weight, else 1).
type keyed struct {
	key    string
	weight float64
}

func (r *metricRun) sessionKeys(s *sessionRow, by string, asSplit bool) []keyed {
	switch by {
	case "":
		return []keyed{{"", 1}}
	case "day", "week", "month":
		return []keyed{{r.timeKey(s.day), 1}}
	case "area", "energy_type":
		id := s.area
		if by == "energy_type" {
			id = s.energy
		}
		return []keyed{{r.lookupKey(by, id, asSplit), 1}}
	case "kind":
		r.addSeries(s.kind, s.kind, nil, map[string]int64{"task": 0, "event": 1}[s.kind])
		return []keyed{{s.kind, 1}}
	case "session":
		key := strconv.FormatInt(s.id, 10)
		title := s.title
		if title == "" {
			title = "Session " + key
		}
		r.label(key, title, nil)
		if e := r.energy[s.energy]; e != nil {
			r.details[key] = e.name
		}
		return []keyed{{key, 1}}
	case "subtype":
		out := make([]keyed, 0, len(s.subtypes))
		for _, st := range s.subtypes {
			out = append(out, keyed{r.lookupKey("subtype", st.id, asSplit), st.weight})
		}
		return out
	}
	return nil
}

// sessionMetric adds value(s) for every matching session under its group
// and split keys. weighted: subtype shares carry the rank weight;
// otherwise each subtype counts the whole value.
func (d *DB) sessionMetric(ctx context.Context, r *metricRun, value func(*sessionRow) float64, weighted bool) error {
	energy, err := r.energyCandidates()
	if err != nil {
		return err
	}
	if r.def.Direction == "from_energy_type" {
		r.direction = r.directionOf(energy)
	}
	needSubtypes := r.q.Group == "subtype" || r.q.Split == "subtype"
	sessions, err := d.loadSessions(ctx, r, energy, needSubtypes)
	if err != nil {
		return err
	}
	for _, s := range sessions {
		v := value(s)
		for _, g := range r.sessionKeys(s, r.q.Group, false) {
			for _, sp := range r.sessionKeys(s, r.q.Split, true) {
				w := 1.0
				if weighted {
					w = g.weight * sp.weight
				}
				r.add(g.key, sp.key, v*w)
			}
		}
	}
	return nil
}
