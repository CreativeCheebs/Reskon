package db

import (
	"context"
	"database/sql"
	"strconv"
	"time"
)

// Task metrics: closed and open counts, time in status, cycle time. They
// read the transition log through the same derivations as the board
// (derive.go, cycletime.go). Epics are left out: they sit open for weeks
// by design and would crowd every list.

func init() {
	taskFilters := []string{"area", "energy_type", "status", "task_id"}
	register(&metricDef{
		Name: "tasks_closed", Label: "Tasks closed", Unit: "count",
		Description: "Tasks that moved into a done status, by the local day they were completed.",
		Groups:      []string{"day", "week", "month", "area"},
		Splits:      []string{"area"},
		Filters:     taskFilters, Reduce: "sum", Ranged: true,
		run: (*DB).tasksClosed,
	})
	register(&metricDef{
		Name: "tasks_open", Label: "Open tasks", Unit: "count",
		Description: "Tasks open now (to do or in progress). The range is ignored.",
		Groups:      []string{"status", "area"},
		Splits:      []string{"area", "status"},
		Filters:     taskFilters, Reduce: "sum",
		run: (*DB).tasksOpen,
	})
	register(&metricDef{
		Name: "time_in_status", Label: "Time in status", Unit: "hours",
		Description: "How long open tasks on the board have sat in their current status, longest first. Statuses off the board (Backlog) are left out unless filtered for, and snoozed tasks always are. The range is ignored.",
		Groups:      []string{"task", "status"},
		Filters:     taskFilters, Reduce: "max",
		run: (*DB).timeInStatus,
	})
	register(&metricDef{
		Name: "cycle_time", Label: "Cycle time", Unit: "hours",
		Description: "Hours tasks spent in open statuses within the range, from the transition log.",
		Groups:      []string{"task", "status"},
		Splits:      []string{"status"},
		Filters:     taskFilters, Reduce: "sum", Ranged: true,
		run: (*DB).cycleTime,
	})
}

// metricTasks lists non-epic tasks with derived values, narrowed by the
// query's filters.
func (d *DB) metricTasks(ctx context.Context, r *metricRun) ([]*Task, error) {
	all, err := d.queryTasks(ctx, &ViewFilter{Types: []string{"task"}}, "", r.now)
	if err != nil {
		return nil, err
	}
	sets := map[string]map[int64]bool{}
	for name, rows := range map[string]map[int64]*lookupRow{"area": r.areas, "energy_type": r.energy, "status": r.statuses} {
		if v := r.q.Filters[name]; len(v) > 0 {
			ids, err := resolveIDs(name, v, rows)
			if err != nil {
				return nil, err
			}
			sets[name] = idSet(ids)
		}
	}
	if v := r.q.Filters["task_id"]; len(v) > 0 {
		ids, err := int64Values("task_id", v)
		if err != nil {
			return nil, err
		}
		sets["task_id"] = idSet(ids)
	}
	var out []*Task
	for _, t := range all {
		energy := int64(0)
		if t.EnergyTypeID != nil {
			energy = *t.EnergyTypeID
		}
		if (sets["area"] != nil && !sets["area"][t.AreaID]) ||
			(sets["energy_type"] != nil && !sets["energy_type"][energy]) ||
			(sets["status"] != nil && !sets["status"][t.StatusID]) ||
			(sets["task_id"] != nil && !sets["task_id"][t.ID]) {
			continue
		}
		out = append(out, t)
	}
	return out, nil
}

func idSet(ids []int64) map[int64]bool {
	out := map[int64]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func isOpen(behaviour string) bool { return behaviour == "todo" || behaviour == "in_progress" }

// taskKey is a task's group or split value for area or status.
func (r *metricRun) taskKey(t *Task, by string, asSplit bool) string {
	switch by {
	case "":
		return ""
	case "area":
		return r.lookupKey("area", t.AreaID, asSplit)
	case "status":
		return r.lookupKey("status", t.StatusID, asSplit)
	case "task":
		key := strconv.FormatInt(t.ID, 10)
		r.label(key, t.Title, nil)
		if s := r.statuses[t.StatusID]; s != nil {
			r.details[key] = s.name
		}
		return key
	}
	return ""
}

func (d *DB) tasksClosed(ctx context.Context, r *metricRun) error {
	tasks, err := d.metricTasks(ctx, r)
	if err != nil {
		return err
	}
	for _, t := range tasks {
		if t.CompletedAt == nil {
			continue
		}
		day := r.localDay(*t.CompletedAt)
		if !r.inRange(day) {
			continue
		}
		key := r.timeKey(day)
		if r.q.Group == "area" {
			key = r.taskKey(t, "area", false)
		}
		r.add(key, r.taskKey(t, r.q.Split, true), 1)
	}
	return nil
}

func (d *DB) tasksOpen(ctx context.Context, r *metricRun) error {
	tasks, err := d.metricTasks(ctx, r)
	if err != nil {
		return err
	}
	for _, t := range tasks {
		if isOpen(t.Behaviour) {
			r.add(r.taskKey(t, r.q.Group, false), r.taskKey(t, r.q.Split, true), 1)
		}
	}
	return nil
}

func (d *DB) timeInStatus(ctx context.Context, r *metricRun) error {
	tasks, err := d.metricTasks(ctx, r)
	if err != nil {
		return err
	}
	onBoard := map[int64]bool{}
	if err := scanInto(ctx, d, `SELECT id, on_board FROM status`, func(rows *sql.Rows) error {
		var id int64
		var b bool
		err := rows.Scan(&id, &b)
		onBoard[id] = b
		return err
	}); err != nil {
		return err
	}
	statusFiltered := len(r.q.Filters["status"]) > 0
	for _, t := range tasks {
		// Snoozed tasks are parked on purpose, so they are not stuck.
		if !isOpen(t.Behaviour) || t.Snoozed || (!onBoard[t.StatusID] && !statusFiltered) {
			continue
		}
		r.add(r.taskKey(t, r.q.Group, false), "", t.TimeInStatusH)
	}
	return nil
}

// cycleTime adds each task's hours in open statuses, clipped to the range
// in local time. Time sitting in done or cancelled is not cycle time.
func (d *DB) cycleTime(ctx context.Context, r *metricRun) error {
	tasks, err := d.metricTasks(ctx, r)
	if err != nil || len(tasks) == 0 {
		return err
	}
	behaviour := map[int64]string{}
	if err := scanInto(ctx, d, `SELECT s.id, c.behaviour FROM status s JOIN status_category c ON c.id = s.category_id`,
		func(rows *sql.Rows) error {
			var id int64
			var b string
			err := rows.Scan(&id, &b)
			behaviour[id] = b
			return err
		}); err != nil {
		return err
	}
	ids := make([]any, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	byTask := map[int64][]Transition{}
	if err := scanInto(ctx, d, `SELECT id, task_id, from_status_id, to_status_id, COALESCE(reason, ''), at
		FROM status_transition WHERE task_id IN (`+placeholders(len(ids))+`) ORDER BY task_id, at, id`,
		func(rows *sql.Rows) error {
			var t Transition
			if err := rows.Scan(&t.ID, &t.TaskID, &t.FromStatusID, &t.ToStatusID, &t.Reason, &t.At); err != nil {
				return err
			}
			byTask[t.TaskID] = append(byTask[t.TaskID], t)
			return nil
		}, ids...); err != nil {
		return err
	}
	start, _ := time.ParseInLocation(dateFmt, r.from, r.loc)
	end, _ := time.ParseInLocation(dateFmt, r.to, r.loc)
	end = end.AddDate(0, 0, 1)
	for _, t := range tasks {
		for _, s := range segments(byTask[t.ID], r.now) {
			if !isOpen(behaviour[s.StatusID]) {
				continue
			}
			from, err1 := ParseTime(s.From)
			to, err2 := ParseTime(s.To)
			if err1 != nil || err2 != nil {
				continue
			}
			if from.Before(start) {
				from = start
			}
			if to.After(end) {
				to = end
			}
			if !to.After(from) {
				continue
			}
			h := to.Sub(from).Hours()
			split := ""
			if r.q.Split == "status" {
				split = r.lookupKey("status", s.StatusID, true)
			}
			if r.q.Group == "status" {
				r.add(r.lookupKey("status", s.StatusID, false), split, h)
			} else {
				r.add(r.taskKey(t, "task", false), split, h)
			}
		}
	}
	return nil
}
