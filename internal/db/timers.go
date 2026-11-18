package db

import (
	"context"
	"database/sql"
	"math"
	"time"
)

// Timers for the Day Planner (migration 023). A timer is wall-clock
// timestamps, not a counter, so it keeps counting while the app is closed or
// the device is off: started_at, resumed_at (NULL while paused) and the
// seconds already counted before the last pause. Elapsed time is worked out
// when read. Stop gives back a session DRAFT (nothing is saved) and retires
// the timer; the draft is saved through the ordinary session create.
//
// Normally one timer runs at a time. Timers sync, so a phone that was offline
// can have started a second one; both are kept, and the list says
// conflict: true so the app can tell the user.

// timeNow is the clock; tests replace it.
var timeNow = time.Now

// Timer is one timer as the API shows it.
type Timer struct {
	ID           int64   `json:"id"`
	Day          string  `json:"day"` // the local date the time will be logged for
	Kind         string  `json:"kind"`
	TaskID       *int64  `json:"task_id"`
	DayItemID    *int64  `json:"day_item_id"`
	Title        string  `json:"title"` // the task's or the event's
	StartedAt    string  `json:"started_at"`
	ResumedAt    *string `json:"resumed_at"` // when it last (re)started counting; nil while paused
	AccumulatedS int64   `json:"accumulated_s"`
	ElapsedS     int64   `json:"elapsed_s"` // derived now: accumulated_s plus the time since resumed_at
	Running      bool    `json:"running"`
	Stopped      bool    `json:"stopped"` // stopped, waiting for its draft to be saved or discarded
	// Draft is the session to save for a stopped timer (the same as Stop returns); nil otherwise.
	Draft     *SessionDraft `json:"draft"`
	CreatedAt string        `json:"created_at"`
	UpdatedAt string        `json:"updated_at"`
	stoppedAt *string
}

// TimerList is every live timer. Conflict is true when more than one is
// running.
type TimerList struct {
	Timers   []*Timer `json:"timers"`
	Conflict bool     `json:"conflict"`
}

// SessionDraft is what Stop returns: the fields of a session, ready to be
// reviewed and sent to POST /api/sessions, which saves it. Nothing is saved.
type SessionDraft struct {
	Kind      string  `json:"kind"`
	TaskID    *int64  `json:"task_id,omitempty"`
	DayItemID *int64  `json:"day_item_id,omitempty"`
	Label     *string `json:"label,omitempty"` // an event's title
	LoggedFor string  `json:"logged_for"`
	Hours     float64 `json:"hours"`
	StartedAt string  `json:"started_at"`
	EndedAt   string  `json:"ended_at"`
}

// StoppedTimer is the answer to Stop.
type StoppedTimer struct {
	TimerID int64        `json:"timer_id"`
	Draft   SessionDraft `json:"draft"`
}

const timerSelect = `SELECT tm.id, tm.day, COALESCE(i.kind, tm.kind), COALESCE(tm.task_id, i.task_id), CASE WHEN i.deleted_at IS NULL THEN tm.day_item_id END,
	COALESCE(t.title, i.title, tm.title, ''), tm.started_at, tm.resumed_at, tm.stopped_at, tm.accumulated_s, tm.created_at, tm.updated_at
	FROM timer tm
	LEFT JOIN day_item i ON i.id = tm.day_item_id
	LEFT JOIN task t ON t.id = COALESCE(tm.task_id, i.task_id)
	WHERE tm.deleted_at IS NULL`

func scanTimer(r *sql.Rows, now time.Time) (*Timer, error) {
	var tm Timer
	if err := r.Scan(&tm.ID, &tm.Day, &tm.Kind, &tm.TaskID, &tm.DayItemID, &tm.Title, &tm.StartedAt,
		&tm.ResumedAt, &tm.stoppedAt, &tm.AccumulatedS, &tm.CreatedAt, &tm.UpdatedAt); err != nil {
		return nil, err
	}
	tm.Stopped = tm.stoppedAt != nil
	tm.Running = tm.ResumedAt != nil && !tm.Stopped
	if tm.Running {
		tm.ElapsedS = tm.AccumulatedS + sinceSeconds(tm.ResumedAt, now)
	} else {
		tm.ElapsedS = tm.AccumulatedS
	}
	if tm.Stopped {
		tm.Draft = draftOf(&tm)
	}
	return &tm, nil
}

// draftOf is the session a stopped timer would save. Hours are never under
// 0.01 (the smallest a session accepts) nor over 24.
func draftOf(tm *Timer) *SessionDraft {
	end := tm.UpdatedAt
	if tm.stoppedAt != nil {
		end = *tm.stoppedAt
	}
	dr := &SessionDraft{
		Kind: tm.Kind, TaskID: tm.TaskID, DayItemID: tm.DayItemID, LoggedFor: tm.Day,
		Hours:     math.Max(0.01, math.Min(24, math.Round(float64(tm.ElapsedS)/3600*10000)/10000)),
		StartedAt: tm.StartedAt, EndedAt: end,
	}
	if tm.Kind == "event" {
		title := tm.Title
		dr.Label = &title
	}
	return dr
}

// sinceSeconds is whole seconds from the stamp to now; 0 for no stamp or a
// stamp in the future (another device's clock ahead of this one).
func sinceSeconds(stamp *string, now time.Time) int64 {
	if stamp == nil {
		return 0
	}
	t, err := ParseTime(*stamp)
	if err != nil || now.Before(t) {
		return 0
	}
	return int64(now.Sub(t) / time.Second)
}

func listTimers(ctx context.Context, q querier, where string, args ...any) ([]*Timer, error) {
	now := timeNow()
	out := []*Timer{}
	err := scanInto(ctx, q, timerSelect+where+` ORDER BY tm.created_at, tm.id`, func(r *sql.Rows) error {
		tm, err := scanTimer(r, now)
		if err == nil {
			out = append(out, tm)
		}
		return err
	}, args...)
	return out, err
}

func timerList(ctx context.Context, q querier) (*TimerList, error) {
	timers, err := listTimers(ctx, q, ``)
	if err != nil {
		return nil, err
	}
	running := 0
	for _, tm := range timers {
		if tm.Running {
			running++
		}
	}
	return &TimerList{Timers: timers, Conflict: running > 1}, nil
}

func (d *DB) ListTimers(ctx context.Context) (*TimerList, error) { return timerList(ctx, d) }

func getTimer(ctx context.Context, q querier, id int64) (*Timer, error) {
	ts, err := listTimers(ctx, q, ` AND tm.id = ?`, id)
	if err != nil {
		return nil, err
	}
	if len(ts) == 0 {
		return nil, ErrNotFound
	}
	return ts[0], nil
}

func (d *DB) GetTimer(ctx context.Context, id int64) (*Timer, error) { return getTimer(ctx, d, id) }

// runningConflict is the 409 for starting or resuming while another timer runs.
func runningConflict(ctx context.Context, q querier, exceptID int64) error {
	list, err := timerList(ctx, q)
	if err != nil {
		return err
	}
	for _, tm := range list.Timers {
		if tm.Running && tm.ID != exceptID {
			return &ConflictError{Msg: "a timer is already running; pause or stop it first", Current: list}
		}
	}
	return nil
}

// StartTimer starts a timer on a task ({task_id}) or on a plan item
// ({day_item_id}, an event or a planned task), logging for {day}. It is
// refused with a conflict, carrying the timers, while another one is running.
func (d *DB) StartTimer(ctx context.Context, f Fields) (*Timer, error) {
	day, _, err := f.stringField("day")
	if err != nil {
		return nil, err
	}
	if !validDate(day) {
		return nil, invalid("day must be YYYY-MM-DD, the day the time is logged for")
	}
	taskID, hasTask, err := f.int64Field("task_id")
	if err != nil {
		return nil, err
	}
	itemID, hasItem, err := f.int64Field("day_item_id")
	if err != nil {
		return nil, err
	}
	if hasTask == hasItem {
		return nil, invalid("send task_id or day_item_id, one of them")
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var task any
	var item any
	kind, title := "task", ""
	if hasTask {
		err := tx.QueryRowContext(ctx, `SELECT title FROM task WHERE id = ? AND deleted_at IS NULL`, taskID).Scan(&title)
		if err != nil {
			return nil, invalid("task %d does not exist", taskID)
		}
		task = taskID
	} else {
		var itemTask sql.NullInt64
		var itemTitle sql.NullString
		err := tx.QueryRowContext(ctx, `SELECT i.kind, i.task_id, COALESCE(t.title, i.title) FROM day_item i
			LEFT JOIN task t ON t.id = i.task_id WHERE i.id = ? AND i.deleted_at IS NULL`, itemID).Scan(&kind, &itemTask, &itemTitle)
		if err == sql.ErrNoRows {
			return nil, invalid("plan item %d does not exist", itemID)
		}
		if err != nil {
			return nil, err
		}
		item, title = itemID, itemTitle.String
		if itemTask.Valid {
			task = itemTask.Int64
		}
	}
	if err := runningConflict(ctx, tx, 0); err != nil {
		return nil, err
	}
	now := FormatTime(timeNow())
	res, err := tx.ExecContext(ctx, `INSERT INTO timer (day, day_item_id, task_id, kind, title, started_at, resumed_at, accumulated_s, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, day, item, task, kind, title, now, now, now, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	tm, err := getTimer(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	return tm, tx.Commit()
}

func checkLive(ctx context.Context, q querier, table string, id int64) error {
	var one int
	if err := q.QueryRowContext(ctx, `SELECT 1 FROM `+table+` WHERE id = ? AND deleted_at IS NULL`, id).Scan(&one); err != nil {
		return ErrNotFound
	}
	return nil
}

// PauseTimer adds the time since it last ran to accumulated_s and stops the
// clock. Pausing a paused timer changes nothing.
func (d *DB) PauseTimer(ctx context.Context, id int64) (*Timer, error) {
	return d.changeTimer(ctx, id, func(tx *sql.Tx, tm *Timer, now time.Time) error {
		if !tm.Running {
			return nil
		}
		return setTimer(ctx, tx, id, nil, tm.AccumulatedS+sinceSeconds(tm.ResumedAt, now), now)
	})
}

// ResumeTimer starts a paused timer counting again; refused with a conflict
// while another timer is running. Resuming a running timer changes nothing.
func (d *DB) ResumeTimer(ctx context.Context, id int64) (*Timer, error) {
	return d.changeTimer(ctx, id, func(tx *sql.Tx, tm *Timer, now time.Time) error {
		if tm.Running {
			return nil
		}
		if tm.Stopped {
			return invalid("that timer is stopped; save or discard its draft")
		}
		if err := runningConflict(ctx, tx, id); err != nil {
			return err
		}
		stamp := FormatTime(now)
		return setTimer(ctx, tx, id, &stamp, tm.AccumulatedS, now)
	})
}

func setTimer(ctx context.Context, tx *sql.Tx, id int64, resumed *string, accumulated int64, now time.Time) error {
	_, err := tx.ExecContext(ctx, `UPDATE timer SET resumed_at = ?, accumulated_s = ?, updated_at = ? WHERE id = ?`,
		resumed, accumulated, FormatTime(now), id)
	return err
}

func (d *DB) changeTimer(ctx context.Context, id int64, change func(*sql.Tx, *Timer, time.Time) error) (*Timer, error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	tm, err := getTimer(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if err := change(tx, tm, timeNow()); err != nil {
		return nil, err
	}
	if tm, err = getTimer(ctx, tx, id); err != nil {
		return nil, err
	}
	return tm, tx.Commit()
}

// StopTimer stops the timer and returns its session draft. The timer is NOT
// retired: it stays, stopped, with its count frozen, until the draft is saved
// (POST /api/sessions with timer_id) or the timer is discarded, so the time is
// never lost to a closed app. Stopping again returns the same draft.
func (d *DB) StopTimer(ctx context.Context, id int64) (*StoppedTimer, error) {
	tm, err := d.changeTimer(ctx, id, func(tx *sql.Tx, tm *Timer, now time.Time) error {
		if tm.Stopped {
			return nil
		}
		// A paused timer ended when it was paused.
		stamp := FormatTime(now)
		if !tm.Running {
			stamp = tm.UpdatedAt
		}
		_, err := tx.ExecContext(ctx, `UPDATE timer SET resumed_at = NULL, stopped_at = ?, accumulated_s = ?, updated_at = ? WHERE id = ?`,
			stamp, tm.AccumulatedS+sinceSeconds(tm.ResumedAt, now), FormatTime(now), id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &StoppedTimer{TimerID: id, Draft: *tm.Draft}, nil
}

// DiscardTimer throws a timer away without a draft.
func (d *DB) DiscardTimer(ctx context.Context, id int64) error {
	res, err := d.ExecContext(ctx, `UPDATE timer SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
		FormatTime(timeNow()), FormatTime(timeNow()), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
