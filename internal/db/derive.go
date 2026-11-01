package db

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"time"
)

// TaskDerived holds values computed on read. None of these are stored.
// This file is their one implementation; the client never recomputes them.
type TaskDerived struct {
	Behaviour      string   `json:"behaviour"`        // behaviour of the current status's category
	FirstStartedAt *string  `json:"first_started_at"` // earliest move into in_progress
	LastStartedAt  *string  `json:"last_started_at"`  // latest move into in_progress
	CompletedAt    *string  `json:"completed_at"`     // start of the current done run; nil if not done
	CancelledAt    *string  `json:"cancelled_at"`     // start of the current cancelled run; nil if not cancelled
	LastMovedAt    string   `json:"last_moved_at"`    // latest transition of any kind
	CreatedAgeH    float64  `json:"created_age_h"`    // now - created_at
	StartedAgeH    *float64 `json:"started_age_h"`    // now - first_started_at
	TimeInStatusH  float64  `json:"time_in_status_h"` // now - last_moved_at
	Stalled        bool     `json:"stalled"`          // time in status passed the status's alert_after_days
	Points         *float64 `json:"points"`           // difficulty x priority weight
	LoggedH        float64  `json:"logged_h"`         // sum of session hours against the task
	ProgressPct    *float64 `json:"progress_pct"`     // logged_h / estimate_h x 100, capped at 100; nil without estimate
	RemainingH     *float64 `json:"remaining_h"`      // estimate_h - logged_h, below zero once over; nil without estimate
	DaysToDue      *int     `json:"days_to_due"`      // calendar days from today to due_at: 0 due today, below zero overdue; nil without due date or once finished
	PaceH          *float64 `json:"pace_h"`           // remaining_h spread over the days left, today and the due day included; nil unless both are known and positive
	Snoozed        bool     `json:"snoozed"`          // snoozed_until is after today (server's time zone) and the task is open
	Missing        []string `json:"missing"`          // required fields (setting task_completeness) an open task lacks; empty when complete
	Subtypes       []string `json:"subtypes"`         // distinct subtypes from the task's sessions
	EpicTasks      *int     `json:"epic_tasks"`       // epics only: tasks in it, cancelled excluded
	EpicDone       *int     `json:"epic_done"`        // epics only: how many of those are done
	EpicEstimateH  *float64 `json:"epic_estimate_h"`  // epics only: summed estimates of those tasks
	EpicLoggedH    *float64 `json:"epic_logged_h"`    // epics only: hours logged against its tasks, cancelled included
}

// transitionStep is one transition with the behaviour of the status it
// moved into, as the status's category maps it now.
type transitionStep struct {
	At        string
	Behaviour string
}

// deriveDates computes the transition-log dates for one task.
// steps must be in time order and include the creation transition.
func deriveDates(createdAt string, steps []transitionStep, now time.Time) TaskDerived {
	var out TaskDerived
	prev := ""
	for _, s := range steps {
		at := s.At
		if s.Behaviour == "in_progress" {
			if out.FirstStartedAt == nil {
				out.FirstStartedAt = &at
			}
			out.LastStartedAt = &at
		}
		// Completed/cancelled mark the start of the current run in that
		// behaviour. Leaving the behaviour clears them; moving between two
		// statuses of the same behaviour keeps the original date.
		switch {
		case s.Behaviour == "done" && prev != "done":
			out.CompletedAt = &at
		case s.Behaviour != "done":
			out.CompletedAt = nil
		}
		switch {
		case s.Behaviour == "cancelled" && prev != "cancelled":
			out.CancelledAt = &at
		case s.Behaviour != "cancelled":
			out.CancelledAt = nil
		}
		out.LastMovedAt = at
		prev = s.Behaviour
	}
	if out.LastMovedAt == "" {
		out.LastMovedAt = createdAt
	}
	out.CreatedAgeH = hoursSince(createdAt, now)
	out.TimeInStatusH = hoursSince(out.LastMovedAt, now)
	if out.FirstStartedAt != nil {
		h := hoursSince(*out.FirstStartedAt, now)
		out.StartedAgeH = &h
	}
	return out
}

func hoursSince(ts string, now time.Time) float64 {
	t, err := ParseTime(ts)
	if err != nil {
		return 0
	}
	return now.Sub(t).Hours()
}

// taskPoints is difficulty x priority weight. An unset priority weighs 1.0,
// so it distorts nothing. No difficulty means no points.
func taskPoints(difficulty *int64, weight *float64) *float64 {
	if difficulty == nil {
		return nil
	}
	w := 1.0
	if weight != nil {
		w = *weight
	}
	p := float64(*difficulty) * w
	return &p
}

// remainingH is what is left of the estimate: the hours of the estimate not
// yet logged, negative once the task has run over.
func remainingH(logged float64, estimate *float64) *float64 {
	if estimate == nil || *estimate <= 0 {
		return nil
	}
	r := *estimate - logged
	return &r
}

// duePace is how many calendar days remain until the due date (in the
// server's time zone) and, while there is estimate left, the hours a day
// it takes to finish by then. Today and the due day both count, so work
// due today has one day.
func duePace(due *string, remaining *float64, now time.Time) (*int, *float64) {
	if due == nil {
		return nil, nil
	}
	d, err := time.ParseInLocation("2006-01-02", *due, now.Location())
	if err != nil {
		return nil, nil
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	days := int(math.Round(d.Sub(today).Hours() / 24))
	if remaining == nil || *remaining <= 0 || days < 0 {
		return &days, nil
	}
	pace := *remaining / float64(days+1)
	return &days, &pace
}

// progressPct is logged hours as a percentage of the estimate, capped at 100.
func progressPct(logged float64, estimate *float64) *float64 {
	if estimate == nil || *estimate <= 0 {
		return nil
	}
	p := math.Min(100, logged / *estimate * 100)
	return &p
}

// derive fills the derived fields of tasks as of now.
func (d *DB) derive(ctx context.Context, tasks []*Task, now time.Time) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]any, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	in := placeholders(len(ids))

	// Status behaviour as mapped now, including deleted statuses that old
	// transitions still point at.
	behaviour := map[int64]string{}
	alertDays := map[int64]*int64{}
	rows, err := d.QueryContext(ctx, `SELECT s.id, c.behaviour, s.alert_after_days FROM status s
		JOIN status_category c ON c.id = s.category_id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var b string
		var alert *int64
		if err := rows.Scan(&id, &b, &alert); err != nil {
			rows.Close()
			return err
		}
		behaviour[id], alertDays[id] = b, alert
	}
	rows.Close()

	steps := map[int64][]transitionStep{}
	rows, err = d.QueryContext(ctx, fmt.Sprintf(`SELECT task_id, to_status_id, at FROM status_transition
		WHERE task_id IN (%s) ORDER BY task_id, at, id`, in), ids...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var tid, sid int64
		var at string
		if err := rows.Scan(&tid, &sid, &at); err != nil {
			rows.Close()
			return err
		}
		steps[tid] = append(steps[tid], transitionStep{At: at, Behaviour: behaviour[sid]})
	}
	rows.Close()

	weights := map[int64]float64{}
	if err := scanInto(ctx, d, `SELECT id, weight FROM priority`, func(r *sql.Rows) error {
		var id int64
		var w float64
		err := r.Scan(&id, &w)
		weights[id] = w
		return err
	}); err != nil {
		return err
	}

	logged := map[int64]float64{}
	if err := scanInto(ctx, d, fmt.Sprintf(`SELECT task_id, SUM(hours) FROM session
		WHERE deleted_at IS NULL AND task_id IN (%s) GROUP BY task_id`, in), func(r *sql.Rows) error {
		var id int64
		var h float64
		err := r.Scan(&id, &h)
		logged[id] = h
		return err
	}, ids...); err != nil {
		return err
	}

	subtypes := map[int64][]string{}
	if err := scanInto(ctx, d, fmt.Sprintf(`SELECT DISTINCT s.task_id, st.name FROM session s
		JOIN session_subtype ss ON ss.session_id = s.id
		JOIN subtype st ON st.id = ss.subtype_id
		WHERE s.deleted_at IS NULL AND s.task_id IN (%s) ORDER BY s.task_id, st.name`, in), func(r *sql.Rows) error {
		var id int64
		var name string
		err := r.Scan(&id, &name)
		subtypes[id] = append(subtypes[id], name)
		return err
	}, ids...); err != nil {
		return err
	}

	epics, err := d.epicTotalsOf(ctx, ids, in)
	if err != nil {
		return err
	}
	required, err := d.loadCompleteness(ctx)
	if err != nil {
		return err
	}

	for _, t := range tasks {
		t.TaskDerived = deriveDates(t.CreatedAt, steps[t.ID], now)
		if t.Type == "epic" {
			c := epics[t.ID]
			if c == nil {
				c = &epicTotals{}
			}
			t.EpicTasks, t.EpicDone, t.EpicEstimateH, t.EpicLoggedH = &c.tasks, &c.done, &c.estimateH, &c.loggedH
		}
		t.Behaviour = behaviour[t.StatusID]
		if days := alertDays[t.StatusID]; days != nil {
			t.Stalled = t.TimeInStatusH >= float64(*days)*24
		}
		var w *float64
		if t.PriorityID != nil {
			if pw, ok := weights[*t.PriorityID]; ok {
				w = &pw
			}
		}
		t.Points = taskPoints(t.Difficulty, w)
		t.LoggedH = logged[t.ID]
		t.ProgressPct = progressPct(t.LoggedH, t.EstimateH)
		t.RemainingH = remainingH(t.LoggedH, t.EstimateH)
		if t.Behaviour != "done" && t.Behaviour != "cancelled" {
			t.DaysToDue, t.PaceH = duePace(t.DueAt, t.RemainingH, now)
		}
		t.Snoozed = isSnoozed(t.SnoozedUntil, t.Behaviour, now)
		t.Missing = missingFields(t, required)
		t.Subtypes = subtypes[t.ID]
		if t.Subtypes == nil {
			t.Subtypes = []string{}
		}
	}
	return nil
}

// scanInto runs a query and calls fn for each row.
func scanInto(ctx context.Context, q querier, query string, fn func(*sql.Rows) error, args ...any) error {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := fn(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}
