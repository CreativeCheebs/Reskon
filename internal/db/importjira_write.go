package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// ImportReport says what an import did (or, on a dry run, would do).
type ImportReport struct {
	DryRun      bool     `json:"dry_run"`
	Tasks       int      `json:"tasks"`
	Epics       int      `json:"epics"`
	InEpics     int      `json:"in_epics"`
	Transitions int      `json:"transitions"`
	Sessions    int      `json:"sessions"`
	SessionH    float64  `json:"session_hours"`
	Comments    int      `json:"comments"`
	Links       int      `json:"links"`
	Created     []string `json:"created"`  // lookup rows the import added
	Warnings    []string `json:"warnings"` // anything not carried over exactly
}

// How Jira's names map onto JitterBug. Anything not listed is created.
var (
	jiraAreas = map[string]struct{ Name, Prefix, Energy string }{
		// Main job keeps the OM2 prefix, so imported keys and new keys match.
		"mainjob":   {"Main job", "OM2", "Engineering"},
		"personal":  {"Personal", "PER", "Admin"},
		"freelance": {"Freelance", "FRL", "Engineering"},
	}
	jiraStatuses = map[string]struct {
		Name, Behaviour string
		Position        int
	}{
		"to do":       {"To do", "todo", 1},
		"planned":     {"Planned", "todo", 1},
		"in progress": {"In progress", "in_progress", 2},
		"paused":      {"Paused", "todo", 2},
		"done":        {"Done", "done", 3},
		"cancelled":   {"Cancelled", "cancelled", 4},
	}
	jiraPriorities = map[string]struct {
		Name     string
		Weight   float64
		Position int
	}{
		"lowest":  {"Lowest", 0.5, -1},
		"low":     {"Low", 0.75, 0},
		"medium":  {"Normal", 1.0, 1},
		"high":    {"High", 1.5, 2},
		"highest": {"Highest", 2.0, 3},
	}
)

// ImportJira loads a Jira export into this (one person's) database in a
// single transaction: areas, statuses, priorities, epics and tasks with
// their original keys, the status history as transitions, and worklogs as
// sessions. A dry run does all of it and then rolls back. It refuses to
// run if any imported key already exists, so it cannot double-import.
//
// areaNames maps a Jira label (lower case, e.g. "mainjob") to the name of an
// existing area to use instead of the default mapping; it may be nil.
func (d *DB) ImportJira(ctx context.Context, path string, dryRun bool, areaNames map[string]string) (*ImportReport, error) {
	ex, err := readJiraExport(ctx, path)
	if err != nil {
		return nil, err
	}
	rep := &ImportReport{DryRun: dryRun, Created: []string{}, Warnings: []string{}}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	im := &importer{ctx: ctx, tx: tx, rep: rep, ids: map[string]int64{}, energyOf: map[int64]*int64{}, areaOf: map[int64]int64{},
		areaNames: map[string]string{}, areaCache: map[string]cachedArea{}}
	for label, name := range areaNames {
		var one int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM area WHERE lower(name) = lower(?) AND deleted_at IS NULL`, name).Scan(&one); err != nil {
			return nil, invalid("no area named %q to map %s onto", name, label)
		}
		im.areaNames[strings.ToLower(label)] = name
	}

	keys := make([]any, len(ex.Issues))
	for i, is := range ex.Issues {
		keys[i] = is.Key
	}
	var clash int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM task WHERE key IN (`+placeholders(len(keys))+`)`, keys...).Scan(&clash); err != nil {
		return nil, err
	}
	if clash > 0 {
		return nil, &ConflictError{Msg: fmt.Sprintf("%d of these Jira keys already exist here; this export was already imported", clash)}
	}

	byKey := map[string]jiraIssue{}
	for _, is := range ex.Issues {
		byKey[is.Key] = is
	}
	if err := im.customFields(); err != nil {
		return nil, err
	}

	// Pass 1: every issue (epics first so pass 2 can link to them).
	ordered := append([]jiraIssue{}, ex.Issues...)
	for i, is := range ordered {
		if err := im.issue(is, byKey, ex, float64(i+1)); err != nil {
			return nil, fmt.Errorf("%s: %w", is.Key, err)
		}
	}
	// Pass 2: epic links.
	for _, is := range ex.Issues {
		parent, ok := byKey[is.ParentKey]
		if !ok || !strings.EqualFold(parent.Type, "epic") || strings.EqualFold(is.Type, "epic") {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE task SET epic_id = ? WHERE id = ?`, im.ids[parent.Key], im.ids[is.Key]); err != nil {
			return nil, err
		}
		rep.InEpics++
	}
	for _, w := range ex.Worklogs {
		if err := im.worklog(w); err != nil {
			return nil, fmt.Errorf("worklog %s: %w", w.ID, err)
		}
	}
	if dryRun {
		return rep, nil // deferred Rollback undoes everything
	}
	return rep, tx.Commit()
}

type importer struct {
	ctx      context.Context
	tx       *sql.Tx
	rep      *ImportReport
	ids      map[string]int64 // Jira key -> task id
	energyOf map[int64]*int64 // task id -> energy type
	areaOf   map[int64]int64  // task id -> area

	areaNames map[string]string // Jira label -> existing area name chosen by the person
	areaCache map[string]cachedArea
}

type cachedArea struct {
	id     int64
	energy *int64
}

func (im *importer) issue(is jiraIssue, byKey map[string]jiraIssue, ex *jiraExport, pos float64) error {
	label := jiraLabel(is.Labels)
	if label == "" { // inherit from the parent (epic or task)
		if p, ok := byKey[is.ParentKey]; ok {
			label = jiraLabel(p.Labels)
		}
	}
	if label == "" {
		label = "mainjob"
		im.warn("%s has no area label; put in Main job", is.Key)
	}
	areaID, energyID, err := im.area(label)
	if err != nil {
		return err
	}
	statusID, err := im.status(is.Status)
	if err != nil {
		return err
	}

	var priorityID *int64
	if is.Priority != "" {
		id, err := im.priority(is.Priority)
		if err != nil {
			return err
		}
		priorityID = &id
	}
	var difficulty *int64
	if is.Difficulty != "" {
		if v, ok := jiraDifficulty[strings.ToLower(is.Difficulty)]; ok {
			difficulty = &v
		} else {
			im.warn("%s: unknown difficulty %q left blank", is.Key, is.Difficulty)
		}
	}
	var estimate *float64
	if is.EstimateSec.Valid && is.EstimateSec.Int64 > 0 {
		h := float64(is.EstimateSec.Int64) / 3600
		estimate = &h
	}
	var due *string
	if is.DueDate != "" && validDate(is.DueDate) {
		due = &is.DueDate
	}

	typ := "task"
	switch strings.ToLower(is.Type) {
	case "epic":
		typ = "epic"
		im.rep.Epics++
	case "sub-task", "subtask":
		im.warn("%s was a Jira sub-task of %s; imported as a task, link kept in Jira links", is.Key, is.ParentKey)
	}

	// Things JitterBug has no column for are kept, not dropped.
	custom := map[string]any{"_jira": map[string]any{"id": is.ID, "type": is.Type, "status": is.Status, "resolution": is.Resolution, "labels": is.Labels}}
	if p, ok := jiraPoints(is.Points); ok {
		custom["jira_points"] = p
	}
	var start *string
	if s := firstN(is.StartDate, 10); validDate(s) {
		start = &s
	}
	var links []string
	for _, l := range ex.Links[is.Key] {
		links = append(links, fmt.Sprintf("%s %s", l.Type, l.Other))
		im.rep.Links++
	}
	if p, ok := byKey[is.ParentKey]; ok && !strings.EqualFold(p.Type, "epic") {
		links = append(links, "sub-task of "+is.ParentKey)
	}
	if len(links) > 0 {
		custom["jira_links"] = strings.Join(links, "; ")
	}
	customJSON, _ := json.Marshal(custom)

	desc := is.Description
	if cs := ex.Comments[is.Key]; len(cs) > 0 {
		var b strings.Builder
		b.WriteString(desc)
		if desc != "" {
			b.WriteString("\n\n")
		}
		b.WriteString("--- Comments from Jira ---")
		for _, c := range cs {
			fmt.Fprintf(&b, "\n[%s %s] %s", firstN(c.Created, 10), c.Author, strings.TrimSpace(c.Body))
			im.rep.Comments++
		}
		desc = b.String()
	}
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	created, err := jiraTime(is.Created)
	if err != nil {
		return err
	}
	updated, err := jiraTime(is.Updated)
	if err != nil {
		updated = created
	}

	res, err := im.tx.ExecContext(im.ctx, `INSERT INTO task (key, title, description, area_id, status_id, priority_id,
		energy_type_id, difficulty, estimate_h, due_at, board_pos, custom, created_at, updated_at, type, start_date)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		is.Key, strings.TrimSpace(is.Summary), descPtr, areaID, statusID, priorityID, energyID, difficulty, estimate, due,
		pos, string(customJSON), created, updated, typ, start)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	im.ids[is.Key] = id
	im.energyOf[id] = energyID
	im.areaOf[id] = areaID
	im.rep.Tasks++
	return im.transitions(is, id, statusID, created, ex.Changes[is.Key])
}

// transitions rebuilds the log: the creation into the first status, then
// every recorded status change, so cycle time and dates are real.
func (im *importer) transitions(is jiraIssue, id, currentStatus int64, created string, changes []jiraStatusChange) error {
	first := currentStatus
	if len(changes) > 0 {
		s, err := im.status(changes[0].From)
		if err != nil {
			return err
		}
		first = s
	}
	if err := writeTransition(im.ctx, im.tx, id, nil, first, "user", created); err != nil {
		return err
	}
	im.rep.Transitions++
	prev := first
	for _, c := range changes {
		at, err := jiraTime(c.At)
		if err != nil {
			return err
		}
		if at < created {
			at = created
		}
		to, err := im.status(c.To)
		if err != nil {
			return err
		}
		from := prev
		if err := writeTransition(im.ctx, im.tx, id, &from, to, "user", at); err != nil {
			return err
		}
		im.rep.Transitions++
		prev = to
	}
	if prev != currentStatus {
		im.warn("%s: status history ends in a different status than the issue's current one", is.Key)
	}
	return nil
}

func (im *importer) worklog(w jiraWorklog) error {
	taskID, ok := im.ids[w.Key]
	if !ok {
		im.warn("worklog %s is for %s, which is not in the export; skipped", w.ID, w.Key)
		return nil
	}
	h := float64(w.Seconds) / 3600
	if h <= 0 || h > 24 {
		im.warn("worklog %s on %s has %.2fh; skipped (sessions must be 0-24h)", w.ID, w.Key, h)
		return nil
	}
	energy := im.energyOf[taskID]
	if energy == nil {
		im.warn("worklog %s: task %s has no energy type; skipped", w.ID, w.Key)
		return nil
	}
	var started *string
	if w.Started != "" {
		if s, err := jiraTime(w.Started); err == nil {
			started = &s
		}
	}
	day := w.Date
	if !validDate(day) {
		day = firstN(w.Started, 10)
	}
	var note *string
	if c := strings.TrimSpace(w.Comment); c != "" {
		note = &c
	}
	custom, _ := json.Marshal(map[string]any{"_jira": map[string]any{"worklog_id": w.ID}})
	points, err := storedPoints(im.ctx, im.tx, *energy, h, nil, &taskID)
	if err != nil {
		return err
	}
	if _, err := im.tx.ExecContext(im.ctx, `INSERT INTO session (task_id, area_id, kind, energy_type_id, hours, points, started_at,
		logged_for, note, custom, created_at) VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, ?, ?)`,
		taskID, im.areaOf[taskID], *energy, h, points, started, day, note, string(custom), Now()); err != nil {
		return err
	}
	im.rep.Sessions++
	im.rep.SessionH += h
	return nil
}
