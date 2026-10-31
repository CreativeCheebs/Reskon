package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

// fakeJiraExport writes a tiny export with the same tables and columns the
// real export script produces.
func fakeJiraExport(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "jira.db")
	src, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	stmts := []string{
		`CREATE TABLE issues (id TEXT, key TEXT, project_key TEXT, issue_type TEXT, summary TEXT, description TEXT,
			status TEXT, status_category TEXT, priority TEXT, resolution TEXT, assignee TEXT, reporter TEXT, creator TEXT,
			parent_key TEXT, labels TEXT, components TEXT, fix_versions TEXT, difficulty TEXT, story_points TEXT,
			original_estimate_seconds INTEGER, remaining_estimate_seconds INTEGER, time_spent_seconds INTEGER,
			created TEXT, updated TEXT, resolved TEXT, due_date TEXT, raw_json TEXT)`,
		`CREATE TABLE changelog (history_id TEXT, issue_key TEXT, author TEXT, created TEXT, field TEXT, from_value TEXT, to_value TEXT)`,
		`CREATE TABLE worklogs (id TEXT, issue_key TEXT, author TEXT, started TEXT, date TEXT, time_spent TEXT,
			time_spent_seconds INTEGER, comment TEXT, created TEXT, updated TEXT, raw_json TEXT)`,
		`CREATE TABLE comments (id TEXT, issue_key TEXT, author TEXT, body TEXT, created TEXT, updated TEXT, raw_json TEXT)`,
		`CREATE TABLE issue_links (id TEXT, issue_key TEXT, link_type TEXT, direction TEXT, other_key TEXT)`,
		`INSERT INTO issues (id, key, issue_type, summary, status, priority, labels, created, updated, raw_json)
			VALUES ('1', 'OM2-10', 'Epic', 'STM32 demo', 'In Progress', 'High', '["MainJob"]',
			'2026-01-01T10:00:00.000+0530', '2026-01-01T10:00:00.000+0530', '{"fields":{"customfield_10019":"0|a"}}')`,
		`INSERT INTO issues (id, key, issue_type, summary, description, status, priority, labels, parent_key, difficulty,
			story_points, original_estimate_seconds, due_date, created, updated, resolved, raw_json)
			VALUES ('2', 'OM2-11', 'Task', 'Bring-up', 'Board first', 'Done', 'Highest', '[]', 'OM2-10', 'Very Hard', '1/2',
			7200, '2026-01-20', '2026-01-02T09:00:00.000+0530', '2026-01-05T09:00:00.000+0530', '2026-01-05T09:00:00.000+0530',
			'{"fields":{"customfield_10019":"0|b","customfield_10015":"2026-01-03"}}')`,
		`INSERT INTO issues (id, key, issue_type, summary, status, priority, labels, parent_key, created, updated, raw_json)
			VALUES ('3', 'OM2-12', 'Sub-task', 'Solder', 'Planned', 'Medium', '["personal"]', 'OM2-11',
			'2026-01-02T09:00:00.000+0530', '2026-01-02T09:00:00.000+0530', '{}')`,
		`INSERT INTO changelog VALUES ('h1', 'OM2-11', 'me', '2026-01-03T09:00:00.000+0530', 'status', 'To Do', 'In Progress'),
			('h2', 'OM2-11', 'me', '2026-01-05T09:00:00.000+0530', 'status', 'In Progress', 'Done'),
			('h3', 'OM2-11', 'me', '2026-01-04T09:00:00.000+0530', 'Rank', NULL, NULL)`,
		`INSERT INTO worklogs (id, issue_key, started, date, time_spent_seconds, comment)
			VALUES ('w1', 'OM2-11', '2026-01-03T10:00:00.000+0530', '2026-01-03', 9000, 'flashing'),
			('w2', 'OM2-11', '2026-01-04T10:00:00.000+0530', '2026-01-04', 0, '')`,
		`INSERT INTO comments (id, issue_key, author, body, created) VALUES ('c1', 'OM2-11', 'me', 'worked first try', '2026-01-05T09:00:00.000+0530')`,
		`INSERT INTO issue_links VALUES ('l1', 'OM2-11', 'blocks', 'outward', 'OM2-99')`,
	}
	for _, s := range stmts {
		if _, err := src.Exec(s); err != nil {
			t.Fatalf("%v\n%s", err, s)
		}
	}
	return path
}

func TestImportJira(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	path := fakeJiraExport(t)

	// Dry run writes nothing.
	rep, err := d.ImportJira(ctx, path, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Tasks != 3 || count(t, d, "task") != 0 {
		t.Fatalf("dry run: report %d tasks, table has %d", rep.Tasks, count(t, d, "task"))
	}

	rep, err = d.ImportJira(ctx, path, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Epics != 1 || rep.InEpics != 1 || rep.Sessions != 1 || rep.Comments != 1 || rep.Links != 1 {
		t.Errorf("report = %+v", rep)
	}
	tasks, _ := d.ListTasks(ctx)
	byKey := map[string]*Task{}
	for _, tk := range tasks {
		byKey[tk.Key] = tk
	}
	epic, task, sub := byKey["OM2-10"], byKey["OM2-11"], byKey["OM2-12"]
	if epic == nil || task == nil || sub == nil {
		t.Fatalf("keys not kept: %v", byKey)
	}
	if epic.Type != "epic" || task.EpicID == nil || *task.EpicID != epic.ID {
		t.Errorf("epic link lost: epic type %s, task epic %v", epic.Type, task.EpicID)
	}
	// Unlabelled task takes its epic's area; history gives real dates.
	if task.AreaID != epic.AreaID {
		t.Errorf("task area %d, want its epic's %d", task.AreaID, epic.AreaID)
	}
	if task.FirstStartedAt == nil || *task.FirstStartedAt != "2026-01-03T03:30:00.000000000Z" {
		t.Errorf("first started = %v", task.FirstStartedAt)
	}
	if task.CompletedAt == nil || *task.CompletedAt != "2026-01-05T03:30:00.000000000Z" {
		t.Errorf("completed = %v", task.CompletedAt)
	}
	if task.Difficulty == nil || *task.Difficulty != 4 || task.EstimateH == nil || *task.EstimateH != 2 || task.LoggedH != 2.5 {
		t.Errorf("fields: difficulty %v estimate %v logged %v", task.Difficulty, task.EstimateH, task.LoggedH)
	}
	if !strings.Contains(*task.Description, "worked first try") || !strings.Contains(string(task.Custom), `"jira_points":0.5`) ||
		!strings.Contains(string(task.Custom), "blocks OM2-99") || task.StartDate == nil || *task.StartDate != "2026-01-03" {
		t.Errorf("kept data missing: desc %q custom %s", *task.Description, task.Custom)
	}
	if !strings.Contains(string(sub.Custom), "sub-task of OM2-11") {
		t.Errorf("sub-task parent lost: %s", sub.Custom)
	}
	var planned string
	d.QueryRow(`SELECT s.name FROM task t JOIN status s ON s.id = t.status_id WHERE t.key = 'OM2-12'`).Scan(&planned)
	if planned != "Planned" {
		t.Errorf("sub-task status = %q, want Planned (created)", planned)
	}
	// New tasks continue the numbering.
	next := mustTask(t, d, epic.AreaID, "after import")
	if next.Key != "OM2-13" {
		t.Errorf("next key = %s, want OM2-13", next.Key)
	}
	// Importing again is refused.
	if _, err := d.ImportJira(ctx, path, false, nil); err == nil {
		t.Error("second import accepted")
	}
}

func TestJiraValueParsing(t *testing.T) {
	if p, ok := jiraPoints("1/4"); !ok || p != 0.25 {
		t.Errorf("1/4 = %v", p)
	}
	if p, ok := jiraPoints("13"); !ok || p != 13 {
		t.Errorf("13 = %v", p)
	}
	if _, ok := jiraPoints(""); ok {
		t.Error("empty parsed")
	}
	if s, err := jiraTime("2026-01-14T18:41:44.578+0530"); err != nil || s != "2026-01-14T13:11:44.578000000Z" {
		t.Errorf("time = %s %v", s, err)
	}
}

func TestImportJiraIntoExistingAreas(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	job := mustArea(t, d, "Day Job", "JOB")
	// An existing area with no default energy type must not lose worklogs.
	if _, err := d.CreateArea(ctx, fields(t, `{"name":"Personal","key_prefix":"PER"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ImportJira(ctx, fakeJiraExport(t), false, map[string]string{"mainjob": "Nope"}); err == nil {
		t.Error("mapping onto a missing area accepted")
	}
	rep, err := d.ImportJira(ctx, fakeJiraExport(t), false, map[string]string{"MainJob": "Day Job"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Sessions != 1 {
		t.Errorf("sessions = %d, want 1", rep.Sessions)
	}
	for _, c := range rep.Created {
		if strings.HasPrefix(c, "area Main job") {
			t.Errorf("created %q despite mapping to Day Job", c)
		}
	}
	tasks, _ := d.ListTasks(ctx)
	for _, tk := range tasks {
		if tk.Key == "OM2-10" && tk.AreaID != job.ID {
			t.Errorf("epic in area %d, want Day Job %d", tk.AreaID, job.ID)
		}
		if tk.Key == "OM2-12" && tk.EnergyTypeID == nil {
			t.Error("task in Personal (no default) got no energy type")
		}
	}
	// New Day Job tasks keep Day Job's own prefix.
	if k := mustTask(t, d, job.ID, "x").Key; k != "JOB-1" {
		t.Errorf("next Day Job key = %s", k)
	}
}
