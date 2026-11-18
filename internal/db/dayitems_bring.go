package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"strconv"
)

// Bring forward (owner decision): only when the user asks, never by itself.
// The candidates are unfinished tasks (status not done or cancelled) planned
// on any earlier day and not already on the chosen day. Bringing one forward
// copies it onto the day; the earlier day keeps its line, so history is kept.

// BringForwardCandidate is one task that could be brought onto a day.
type BringForwardCandidate struct {
	TaskID    int64    `json:"task_id"`
	Title     string   `json:"title"`
	AreaID    int64    `json:"area_id"`
	EstimateH *float64 `json:"estimate_h"`
	LoggedH   float64  `json:"logged_h"` // all time
	FromDay   string   `json:"from_day"` // the latest earlier day it was planned on
	Days      int      `json:"days"`     // how many earlier days it was planned on
}

func (d *DB) BringForwardCandidates(ctx context.Context, day string) ([]BringForwardCandidate, error) {
	if !validDate(day) {
		return nil, invalid("date must be YYYY-MM-DD")
	}
	out := []BringForwardCandidate{}
	err := scanInto(ctx, d, `SELECT t.id, t.title, t.area_id, t.estimate_h,
		COALESCE((SELECT SUM(hours) FROM session WHERE deleted_at IS NULL AND task_id = t.id), 0),
		MAX(i.day), COUNT(DISTINCT i.day)
		FROM day_item i
		JOIN task t ON t.id = i.task_id AND t.deleted_at IS NULL
		JOIN status st ON st.id = t.status_id
		JOIN status_category c ON c.id = st.category_id
		WHERE i.deleted_at IS NULL AND i.day < ? AND c.behaviour NOT IN ('done', 'cancelled')
		  AND NOT EXISTS (SELECT 1 FROM day_item x WHERE x.deleted_at IS NULL AND x.task_id = t.id AND x.day = ?)
		GROUP BY t.id ORDER BY MAX(i.day) DESC, t.id`, func(r *sql.Rows) error {
		var c BringForwardCandidate
		if err := r.Scan(&c.TaskID, &c.Title, &c.AreaID, &c.EstimateH, &c.LoggedH, &c.FromDay, &c.Days); err != nil {
			return err
		}
		out = append(out, c)
		return nil
	}, day, day)
	return out, err
}

// BringForward adds the tasks to the day, in the order given, after what is
// already there. A task already on the day is skipped; a task that is not a
// candidate (never planned earlier, or finished) is refused.
func (d *DB) BringForward(ctx context.Context, day string, taskIDs []int64) (*Day, error) {
	cands, err := d.BringForwardCandidates(ctx, day)
	if err != nil {
		return nil, err
	}
	ok := map[int64]bool{}
	for _, c := range cands {
		ok[c.TaskID] = true
	}
	for _, id := range taskIDs {
		if _, onDay := plannedItemOn(ctx, d, day, id); onDay {
			continue
		}
		if !ok[id] {
			return nil, invalid("task %d cannot be brought forward: it was not planned on an earlier day, or it is finished", id)
		}
	}
	for _, id := range taskIDs {
		if _, onDay := plannedItemOn(ctx, d, day, id); onDay {
			continue
		}
		if _, err := d.AddDayItem(ctx, day, Fields{"task_id": json.RawMessage(strconv.FormatInt(id, 10))}); err != nil {
			return nil, err
		}
	}
	return d.GetDay(ctx, day)
}
