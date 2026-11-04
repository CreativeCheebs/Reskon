package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Segment is one stretch of time a task spent in one status, read straight
// off the transition log: from one transition to the next (or to now).
type Segment struct {
	StatusID int64   `json:"status_id"`
	From     string  `json:"from"`
	To       string  `json:"to"`
	Hours    float64 `json:"hours"`
	Current  bool    `json:"current"` // still in this status
}

// segments turns a time-ordered transition log into status segments.
func segments(trs []Transition, now time.Time) []Segment {
	out := []Segment{}
	for i, tr := range trs {
		end, current := FormatTime(now), true
		if i+1 < len(trs) {
			end, current = trs[i+1].At, false
		}
		from, err1 := ParseTime(tr.At)
		to, err2 := ParseTime(end)
		h := 0.0
		if err1 == nil && err2 == nil {
			h = to.Sub(from).Hours()
		}
		out = append(out, Segment{StatusID: tr.ToStatusID, From: tr.At, To: end, Hours: h, Current: current})
	}
	return out
}

// TaskSegments is one bar of the cycle-time chart.
type TaskSegments struct {
	TaskID   int64     `json:"task_id"`
	Title    string    `json:"title"`
	Segments []Segment `json:"segments"`
	TotalH   float64   `json:"total_h"`
	// StatusHours sums this task's segments per status, so a status the
	// task passed through twice is one figure.
	StatusHours map[int64]float64 `json:"status_hours"`
}

// CycleTime is the chart for a view: one bar per task, plus hours per
// status summed across all of them (where work waits).
type CycleTime struct {
	Tasks        []TaskSegments    `json:"tasks"`
	StatusTotals map[int64]float64 `json:"status_totals"`
}

func (d *DB) TaskCycle(ctx context.Context, taskID int64) ([]Transition, []Segment, error) {
	trs, err := d.Transitions(ctx, taskID)
	if err != nil {
		return nil, nil, err
	}
	return trs, segments(trs, d.Now(ctx)), nil
}

// CycleTimeForView builds the chart for every task in a view.
func (d *DB) CycleTimeForView(ctx context.Context, viewID int64) (*CycleTime, error) {
	tasks, err := d.ListTasksForView(ctx, viewID, "")
	if err != nil {
		return nil, err
	}
	out := &CycleTime{Tasks: []TaskSegments{}, StatusTotals: map[int64]float64{}}
	if len(tasks) == 0 {
		return out, nil
	}
	ids := make([]any, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	byTask := map[int64][]Transition{}
	err = scanInto(ctx, d, fmt.Sprintf(`SELECT id, task_id, from_status_id, to_status_id, COALESCE(reason, ''), at
		FROM status_transition WHERE task_id IN (%s) ORDER BY task_id, at, id`, placeholders(len(ids))),
		func(r *sql.Rows) error {
			var t Transition
			if err := r.Scan(&t.ID, &t.TaskID, &t.FromStatusID, &t.ToStatusID, &t.Reason, &t.At); err != nil {
				return err
			}
			byTask[t.TaskID] = append(byTask[t.TaskID], t)
			return nil
		}, ids...)
	if err != nil {
		return nil, err
	}
	now := d.Now(ctx)
	for _, t := range tasks {
		ts := TaskSegments{TaskID: t.ID, Title: t.Title, Segments: segments(byTask[t.ID], now), StatusHours: map[int64]float64{}}
		for _, s := range ts.Segments {
			ts.TotalH += s.Hours
			ts.StatusHours[s.StatusID] += s.Hours
			out.StatusTotals[s.StatusID] += s.Hours
		}
		out.Tasks = append(out.Tasks, ts)
	}
	return out, nil
}
