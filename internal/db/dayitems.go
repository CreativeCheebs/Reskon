package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
)

// The Day Planner's list (migration 023). A day has an ordered list of plan
// items: a task (planned on this day) or an event (a title and the minutes
// reserved for it). A task may be planned on several days but only once per
// day. Nothing here moves by itself: an item stays on its day until the user
// moves or removes it.
//
// Everything a row shows that can be worked out is worked out on read:
// logged time, whether it is done, how many minutes it reserves.

// DayItem is one line of a day's plan.
type DayItem struct {
	ID       int64   `json:"id"`
	Day      string  `json:"day"`
	Kind     string  `json:"kind"` // "task" or "event"
	TaskID   *int64  `json:"task_id"`
	Title    string  `json:"title"` // the task's title, or the event's
	AreaID   *int64  `json:"area_id"`
	Position float64 `json:"position"`
	// PlannedMin is the minutes this line reserves: an event's own number, or a
	// task's whole-task estimate in minutes (nil for a task with no estimate).
	PlannedMin *int64 `json:"planned_min"`
	// Task lines: the one whole-task estimate, hours logged against the task on
	// every day (all time), and the part of that logged on this line's day.
	EstimateH       *float64 `json:"estimate_h"`
	LoggedH         float64  `json:"logged_h"`
	LoggedDayH      float64  `json:"logged_day_h"`
	StatusID        *int64   `json:"status_id"`
	StatusBehaviour *string  `json:"status_behaviour"` // todo, in_progress, done, cancelled
	// Done: a task whose status is done or cancelled (it stays on the list, shown
	// done), or an event with a saved session linked to it. Events: LoggedH is the
	// hours of the linked sessions and SessionCount their number.
	Done         bool   `json:"done"`
	SessionCount int    `json:"session_count"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

const dayItemSelect = `SELECT i.id, i.day, i.kind, i.task_id, COALESCE(t.title, i.title, ''),
	COALESCE(t.area_id, i.area_id), i.position, i.planned_min, t.estimate_h, t.status_id, c.behaviour,
	COALESCE((SELECT SUM(hours) FROM session WHERE deleted_at IS NULL AND task_id = i.task_id), 0),
	COALESCE((SELECT SUM(hours) FROM session WHERE deleted_at IS NULL AND task_id = i.task_id AND logged_for = i.day), 0),
	COALESCE((SELECT SUM(hours) FROM session WHERE deleted_at IS NULL AND day_item_id = i.id), 0),
	(SELECT COUNT(*) FROM session WHERE deleted_at IS NULL AND day_item_id = i.id),
	i.created_at, i.updated_at
	FROM day_item i
	LEFT JOIN task t ON t.id = i.task_id AND t.deleted_at IS NULL
	LEFT JOIN status st ON st.id = t.status_id
	LEFT JOIN status_category c ON c.id = st.category_id
	WHERE i.deleted_at IS NULL AND (i.kind = 'event' OR t.id IS NOT NULL)`

func scanDayItem(r *sql.Rows) (*DayItem, error) {
	var it DayItem
	var planned sql.NullInt64
	var evH float64
	err := r.Scan(&it.ID, &it.Day, &it.Kind, &it.TaskID, &it.Title, &it.AreaID, &it.Position, &planned,
		&it.EstimateH, &it.StatusID, &it.StatusBehaviour, &it.LoggedH, &it.LoggedDayH, &evH, &it.SessionCount,
		&it.CreatedAt, &it.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if it.Kind == "event" {
		it.LoggedH = evH
		it.LoggedDayH = 0
		if planned.Valid {
			it.PlannedMin = &planned.Int64
		}
		it.Done = it.SessionCount > 0
		return &it, nil
	}
	if it.EstimateH != nil {
		m := int64(math.Round(*it.EstimateH * 60))
		it.PlannedMin = &m
	}
	if b := it.StatusBehaviour; b != nil {
		it.Done = *b == "done" || *b == "cancelled"
	}
	return &it, nil
}

// dayItems lists the items of days from..to in plan order.
func (d *DB) dayItems(ctx context.Context, from, to string) ([]*DayItem, error) {
	out := []*DayItem{}
	err := scanInto(ctx, d, dayItemSelect+` AND i.day >= ? AND i.day <= ? ORDER BY i.day, i.position, i.id`, func(r *sql.Rows) error {
		it, err := scanDayItem(r)
		if err == nil {
			out = append(out, it)
		}
		return err
	}, from, to)
	return out, err
}

func (d *DB) GetDayItem(ctx context.Context, id int64) (*DayItem, error) {
	var it *DayItem
	err := scanInto(ctx, d, dayItemSelect+` AND i.id = ?`, func(r *sql.Rows) (err error) {
		it, err = scanDayItem(r)
		return err
	}, id)
	if err != nil {
		return nil, err
	}
	if it == nil {
		return nil, ErrNotFound
	}
	return it, nil
}

// nextPosition is one past the last item of the day (soft-deleted ones too,
// so a position is never reused while a tombstone might still sync).
func nextPosition(ctx context.Context, q querier, day string) (float64, error) {
	var max float64
	err := q.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), 0) FROM day_item WHERE day = ? AND deleted_at IS NULL`, day).Scan(&max)
	return max + 1, err
}

// plannedItemOn is the live item for a task on a day, if any.
func plannedItemOn(ctx context.Context, q querier, day string, taskID int64) (int64, bool) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT id FROM day_item WHERE day = ? AND task_id = ? AND deleted_at IS NULL`, day, taskID).Scan(&id)
	return id, err == nil
}

func (d *DB) alreadyPlanned(ctx context.Context, id int64) error {
	cur, err := d.GetDayItem(ctx, id)
	if err != nil {
		return err
	}
	return &ConflictError{Msg: "that task is already on this day's plan", Current: cur}
}

// AddDayItem puts a task ({task_id}) or an event ({title, planned_min, area_id})
// on a day's list, at the end unless {position} is given.
func (d *DB) AddDayItem(ctx context.Context, day string, f Fields) (*DayItem, error) {
	if !validDate(day) {
		return nil, invalid("date must be YYYY-MM-DD")
	}
	taskID, hasTask, err := f.int64Field("task_id")
	if err != nil {
		return nil, err
	}
	// Everything is checked before the transaction opens: the database has one
	// connection, so a read through d while a transaction is open would wait forever.
	var title string
	var minutes, area any
	if hasTask {
		for _, k := range []string{"title", "planned_min", "area_id"} {
			if _, set := f[k]; set {
				return nil, invalid("%s is for events; a task line takes its details from the task", k)
			}
		}
		if err := d.exists(ctx, "task", taskID); err != nil {
			return nil, invalid("task %d does not exist", taskID)
		}
		if id, dup := plannedItemOn(ctx, d, day, taskID); dup {
			return nil, d.alreadyPlanned(ctx, id)
		}
	} else {
		var ok bool
		if title, ok, err = f.stringField("title"); err != nil {
			return nil, err
		}
		if !ok || title == "" {
			return nil, invalid("an event needs a title (or send task_id to plan a task)")
		}
		if minutes, area, err = eventFields(ctx, d, f); err != nil {
			return nil, err
		}
	}
	var wantPos *float64
	if raw, ok := f["position"]; ok {
		v, err := decodeValue("position", kReal, raw)
		if err != nil {
			return nil, err
		}
		p := v.(float64)
		wantPos = &p
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	pos, err := nextPosition(ctx, tx, day)
	if err != nil {
		return nil, err
	}
	if wantPos != nil {
		pos = *wantPos
	}
	now := Now()
	var res sql.Result
	if hasTask {
		res, err = tx.ExecContext(ctx, `INSERT INTO day_item (day, kind, task_id, position, created_at, updated_at) VALUES (?, 'task', ?, ?, ?, ?)`,
			day, taskID, pos, now, now)
	} else {
		res, err = tx.ExecContext(ctx, `INSERT INTO day_item (day, kind, title, planned_min, area_id, position, created_at, updated_at) VALUES (?, 'event', ?, ?, ?, ?, ?, ?)`,
			day, title, minutes, area, pos, now, now)
	}
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetDayItem(ctx, id)
}

// eventFields reads planned_min (whole minutes, 1..1440, or null) and area_id.
func eventFields(ctx context.Context, d *DB, f Fields) (min, area any, err error) {
	if raw, ok := f["planned_min"]; ok && !isNull(raw) {
		var m int64
		if json.Unmarshal(raw, &m) != nil || m < 1 || m > 1440 {
			return nil, nil, invalid("planned_min must be a whole number of minutes, 1 to 1440")
		}
		min = m
	}
	if raw, ok := f["area_id"]; ok && !isNull(raw) {
		var a int64
		if json.Unmarshal(raw, &a) != nil {
			return nil, nil, invalid("area_id must be an area id")
		}
		if d.exists(ctx, "area", a) != nil {
			return nil, nil, invalid("area %d does not exist", a)
		}
		area = a
	}
	return min, area, nil
}

// PatchDayItem changes an event's title, planned_min or area_id, or any
// line's position, or moves it to another day ({day}). Moving a task line to
// a day that already lists the task is a conflict. A session logged against
// an event stays where it was logged.
func (d *DB) PatchDayItem(ctx context.Context, id int64, f Fields) (*DayItem, error) {
	cur, err := d.GetDayItem(ctx, id)
	if err != nil {
		return nil, err
	}
	sets := map[string]any{}
	for k, raw := range f {
		switch k {
		case "position":
			v, err := decodeValue(k, kReal, raw)
			if err != nil {
				return nil, err
			}
			sets[k] = v
		case "day":
			day, _, _ := f.stringField("day")
			if !validDate(day) {
				return nil, invalid("day must be YYYY-MM-DD")
			}
			if day != cur.Day {
				if cur.TaskID != nil {
					if other, dup := plannedItemOn(ctx, d, day, *cur.TaskID); dup {
						return nil, d.alreadyPlanned(ctx, other)
					}
				}
				sets["day"] = day
			}
		case "title", "planned_min", "area_id":
			if cur.Kind != "event" {
				return nil, invalid("%s can only be changed on an event", k)
			}
			switch k {
			case "title":
				v, err := decodeValue(k, kText, raw)
				if err != nil {
					return nil, err
				}
				sets[k] = v
			default:
				min, area, err := eventFields(ctx, d, Fields{k: raw})
				if err != nil {
					return nil, err
				}
				if k == "planned_min" {
					sets[k] = min
				} else {
					sets[k] = area
				}
			}
		default:
			return nil, invalid("field %q cannot be set", k)
		}
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, set := sets["day"]; set {
		if _, hasPos := sets["position"]; !hasPos {
			if sets["position"], err = nextPosition(ctx, tx, sets["day"].(string)); err != nil {
				return nil, err
			}
		}
	}
	sets["updated_at"] = Now()
	for _, col := range sortedKeys(sets) {
		if _, err := tx.ExecContext(ctx, `UPDATE day_item SET `+col+` = ? WHERE id = ?`, sets[col], id); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetDayItem(ctx, id)
}

// DeleteDayItem takes a line off a day's plan. The task is untouched, and
// sessions logged against an event are kept.
func (d *DB) DeleteDayItem(ctx context.Context, id int64) error {
	res, err := d.ExecContext(ctx, `UPDATE day_item SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, Now(), Now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// applyPlanItem fills what a session saved against a plan line leaves out:
// an event line gives kind "event", its title as the label and its area; a
// task line gives its task. Values the caller sent win. Saving the session
// is what completes an event (derived on read).
func (d *DB) applyPlanItem(ctx context.Context, f Fields) error {
	raw, ok := f["day_item_id"]
	if !ok || isNull(raw) {
		return nil
	}
	id, _, err := f.int64Field("day_item_id")
	if err != nil {
		return err
	}
	var kind string
	var task, area sql.NullInt64
	var title sql.NullString
	err = d.QueryRowContext(ctx, `SELECT kind, task_id, title, area_id FROM day_item WHERE id = ? AND deleted_at IS NULL`, id).
		Scan(&kind, &task, &title, &area)
	if err == sql.ErrNoRows {
		return invalid("plan item %d does not exist", id)
	}
	if err != nil {
		return err
	}
	set := func(k string, v any) {
		if _, has := f[k]; !has {
			f[k], _ = json.Marshal(v)
		}
	}
	if kind == "task" {
		set("task_id", task.Int64)
		return nil
	}
	set("kind", "event")
	if title.Valid {
		set("label", title.String)
	}
	if area.Valid {
		set("area_id", area.Int64)
	}
	return nil
}

// OrderDay sets the order of a day's lines to ids, first to last. Lines of
// the day not listed follow in their old order; an id from another day is
// refused.
func (d *DB) OrderDay(ctx context.Context, day string, ids []int64) (*Day, error) {
	if !validDate(day) {
		return nil, invalid("date must be YYYY-MM-DD")
	}
	items, err := d.dayItems(ctx, day, day)
	if err != nil {
		return nil, err
	}
	onDay := map[int64]bool{}
	for _, it := range items {
		onDay[it.ID] = true
	}
	var order []int64
	seen := map[int64]bool{}
	for _, id := range ids {
		if !onDay[id] {
			return nil, invalid("item %d is not on %s", id, day)
		}
		if !seen[id] {
			seen[id] = true
			order = append(order, id)
		}
	}
	for _, it := range items {
		if !seen[it.ID] {
			order = append(order, it.ID)
		}
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	now := Now()
	for i, id := range order {
		if _, err := tx.ExecContext(ctx, `UPDATE day_item SET position = ?, updated_at = ? WHERE id = ? AND position IS NOT ?`,
			float64(i+1), now, id, float64(i+1)); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetDay(ctx, day)
}
