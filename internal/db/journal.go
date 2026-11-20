package db

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"sort"
	"strings"
	"time"
)

// The journal: what you did each day, built from your sessions' notes. One
// function (Journal) answers both the Sessions screen's "Copy as Markdown"
// button and the journal widget, so the text and the totals are worked out
// once, here, and the web page and (later) the phone only show them.
//
// A journal widget (source "journal") saves only {"range": "7d"}. Like a
// board, it never carries a filter: it lists every session of each day.

// SourceJournal is the source of a journal widget.
const SourceJournal = "journal"

// VizJournal is the viz of every journal widget. It is not one of
// WidgetVizzes or AppDataVizzes, so no metric can be drawn as a journal.
const VizJournal = "journal"

// JournalRanges are the ranges a journal widget can have: short ones only,
// since every session of every day is listed.
var JournalRanges = []string{"today", "yesterday", "7d", "30d", "month"}

// JournalWidgetDays is the most days with sessions a journal widget lists
// (the newest ones). A dashboard's Dates choice can be a year wide.
const JournalWidgetDays = 62

// JournalMaxDays is the most days with sessions any one answer holds (the
// newest ones, with More set), so a very wide from..to cannot make a huge answer.
const JournalMaxDays = 366

// JournalQuery is a journal widget's query, e.g. {"range":"7d"}.
type JournalQuery struct {
	Range string `json:"range,omitempty"`
}

// ParseJournalQuery reads a journal widget's query. Only "range" is allowed,
// so a metric query cannot pass for one. No range means 7 days.
func ParseJournalQuery(raw json.RawMessage) (JournalQuery, error) {
	var q JournalQuery
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&q); err != nil {
		return q, invalid(`a journal widget's query is {"range": "7d"} (range is one of %s)`, strings.Join(JournalRanges, ", "))
	}
	if q.Range != "" && !contains(JournalRanges, q.Range) {
		return q, invalid("a journal widget's range must be one of %s", strings.Join(JournalRanges, ", "))
	}
	return q, nil
}

// JournalSession is one session as the journal lists it.
type JournalSession struct {
	ID     int64   `json:"id"`
	TaskID *int64  `json:"task_id"`
	What   string  `json:"what"`  // the session's title, else its task's title, else its label
	Area   *string `json:"area"`  // the area's name
	Kind   string  `json:"kind"`  // task or event
	Start  *string `json:"start"` // local HH:MM, when the session has a start time
	End    *string `json:"end"`   // start plus hours, local HH:MM
	Hours  float64 `json:"hours"`
	Note   *string `json:"note"` // as typed, line breaks and all; null when empty
}

// JournalDay is one day with sessions. Hours and Points are the day's
// totals, worked out here; Markdown is the day ready to paste.
type JournalDay struct {
	Day      string           `json:"day"`
	Hours    float64          `json:"hours"`
	Points   float64          `json:"points"`
	Sessions []JournalSession `json:"sessions"`
	Markdown string           `json:"markdown"`
}

// Journal is the answer: days newest first, days without sessions left out.
// More is true when older days with sessions were cut off at the day limit.
type Journal struct {
	From string       `json:"from"`
	To   string       `json:"to"`
	Days []JournalDay `json:"days"`
	More bool         `json:"more"`
}

// Journal lists the sessions logged for from..to (inclusive dates), by day,
// newest day first. Within a day, sessions with a start time come first in
// time order, then the others in the order they were logged, so the day
// reads from morning to night. At most maxDays days (the newest) are
// listed, never more than JournalMaxDays; More says older ones were left out.
func (d *DB) Journal(ctx context.Context, from, to string, maxDays int) (*Journal, error) {
	if !ValidDates(from, to) {
		return nil, invalid("from and to must be dates (YYYY-MM-DD), from not after to")
	}
	out := &Journal{From: from, To: to, Days: []JournalDay{}}
	if maxDays <= 0 || maxDays > JournalMaxDays {
		maxDays = JournalMaxDays
	}
	// The newest maxDays days that have sessions; the one after them only
	// says there are more.
	days, err := collect(ctx, d, `SELECT DISTINCT logged_for FROM session
		WHERE deleted_at IS NULL AND logged_for >= ? AND logged_for <= ?
		ORDER BY logged_for DESC LIMIT ?`, func(r *sql.Rows) (string, error) {
		var s string
		return s, r.Scan(&s)
	}, from, to, maxDays+1)
	if err != nil {
		return nil, err
	}
	if len(days) > maxDays {
		out.More = true
		from = days[maxDays-1]
	}

	loc := d.Location(ctx)
	// The task's title is read even from a deleted task, so an old session
	// keeps its name. The task's key is never read.
	rows, err := collect(ctx, d, `SELECT s.id, s.task_id, s.title, t.title, s.label, a.name, s.kind, s.hours, s.points,
			COALESCE(s.started_at, ''), s.logged_for, s.note
		FROM session s LEFT JOIN task t ON t.id = s.task_id LEFT JOIN area a ON a.id = s.area_id
		WHERE s.deleted_at IS NULL AND s.logged_for >= ? AND s.logged_for <= ?
		ORDER BY s.logged_for DESC, s.created_at, s.id`,
		func(r *sql.Rows) (journalRow, error) {
			var x journalRow
			var own, title, label, note sql.NullString
			var points sql.NullFloat64
			err := r.Scan(&x.ID, &x.TaskID, &own, &title, &label, &x.Area, &x.Kind, &x.Hours, &points, &x.startedAt, &x.day, &note)
			x.what = journalWhat(own.String, title.String, label.String, x.Kind)
			x.points = points.Float64
			x.Note = cleanNote(note.String)
			x.setTimes(loc)
			return x, err
		}, from, to)
	if err != nil {
		return nil, err
	}
	// Sessions with times first, in time order; the rest keep the order they
	// were logged in (the query's order, which a stable sort leaves alone).
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.day != b.day {
			return a.day > b.day
		}
		if (a.Start != nil) != (b.Start != nil) {
			return a.Start != nil
		}
		return a.Start != nil && a.startedAt < b.startedAt
	})
	for _, x := range rows {
		if n := len(out.Days); n == 0 || out.Days[n-1].Day != x.day {
			out.Days = append(out.Days, JournalDay{Day: x.day, Sessions: []JournalSession{}})
		}
		day := &out.Days[len(out.Days)-1]
		s := x.JournalSession
		s.What = x.what
		day.Sessions = append(day.Sessions, s)
		day.Hours += x.Hours
		day.Points += x.points
	}
	for i := range out.Days {
		out.Days[i].Markdown = journalMarkdown(&out.Days[i])
	}
	return out, nil
}

// journalRow is a session as read, with what the day's totals need.
type journalRow struct {
	JournalSession
	what      string
	day       string
	startedAt string
	points    float64
}

// setTimes gives the session its local start and end, when it has a start
// time that belongs to its day: the same local date as the day it is logged
// for, or the day before (a start just before midnight, logged for the next
// day). A start time from some other date would only mislead, so it is not shown.
func (x *journalRow) setTimes(loc *time.Location) {
	t, err := ParseTime(x.startedAt)
	if err != nil || x.startedAt == "" {
		return
	}
	local := t.In(loc)
	if d := local.Format(dateFmt); d != x.day && d != addDays(x.day, -1) {
		return
	}
	start := local.Format("15:04")
	end := t.Add(time.Duration(math.Round(x.Hours*60)) * time.Minute).In(loc).Format("15:04")
	x.Start, x.End = &start, &end
}

// journalWhat is a session's name: its own title, else its task's title,
// else its label (the description), else a plain word so a line is never
// empty.
func journalWhat(own, title, label, kind string) string {
	for _, s := range []string{own, title, label} {
		if s = strings.Join(strings.Fields(s), " "); s != "" {
			return s
		}
	}
	if kind == "event" {
		return "Event"
	}
	return "Session"
}

// cleanNote keeps a note's own lines (any line ending), drops trailing
// spaces and blank lines at the ends, and gives nil for an empty note.
func cleanNote(note string) *string {
	lines := strings.Split(strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(note), "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(l, " \t")
	}
	for len(lines) > 0 && lines[0] == "" {
		lines = lines[1:]
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 {
		return nil
	}
	s := strings.Join(lines, "\n")
	return &s
}

// JournalForWidget runs a saved journal widget: its own range, or from..to
// when the dashboard's Dates choice is on. At most JournalWidgetDays days.
func (d *DB) JournalForWidget(ctx context.Context, id int64, from, to string) (*Journal, error) {
	w, err := d.GetWidget(ctx, id)
	if err != nil {
		return nil, err
	}
	if w.Source != SourceJournal {
		return nil, invalid("widget %d does not show a journal", id)
	}
	if from == "" && to == "" {
		q, err := ParseJournalQuery(w.Query)
		if err != nil {
			return nil, err
		}
		rng := q.Range
		if rng == "" {
			rng = "7d"
		}
		// Never "all", so resolveRange needs no database here.
		if from, to, err = (*DB)(nil).resolveRange(ctx, &MetricQuery{Range: rng}, d.Now(ctx).Format(dateFmt)); err != nil {
			return nil, err
		}
	}
	return d.Journal(ctx, from, to, JournalWidgetDays)
}
