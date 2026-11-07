package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Importing a Jira export (the SQLite file written by the export script:
// issues, changelog, worklogs, comments, issue_links). Read side here; the
// write side is in importjira_write.go.

type jiraIssue struct {
	Key, Type, Summary, Status, Priority, Labels, Difficulty, Points string
	Description, ParentKey, DueDate, Created, Updated, Resolution    string
	EstimateSec                                                      sql.NullInt64
	Rank, StartDate, ID                                              string
}

type jiraStatusChange struct {
	Key, At, From, To string
}

type jiraWorklog struct {
	ID, Key, Started, Date, Comment string
	Seconds                         int64
}

type jiraComment struct {
	Key, Author, Body, Created string
}

type jiraLink struct {
	Key, Type, Direction, Other string
}

type jiraExport struct {
	Issues   []jiraIssue
	Changes  map[string][]jiraStatusChange // by issue key, oldest first
	Worklogs []jiraWorklog
	Comments map[string][]jiraComment
	Links    map[string][]jiraLink
}

func readJiraExport(ctx context.Context, path string) (*jiraExport, error) {
	src, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer src.Close()
	ex := &jiraExport{Changes: map[string][]jiraStatusChange{}, Comments: map[string][]jiraComment{}, Links: map[string][]jiraLink{}}

	err = scanInto(ctx, src, `SELECT id, key, COALESCE(issue_type,''), COALESCE(summary,''), COALESCE(description,''),
		COALESCE(status,''), COALESCE(priority,''), COALESCE(labels,'[]'), COALESCE(difficulty,''), COALESCE(story_points,''),
		COALESCE(parent_key,''), COALESCE(due_date,''), created, COALESCE(updated, created), COALESCE(resolution,''),
		original_estimate_seconds, COALESCE(raw_json,'{}') FROM issues`, func(r *sql.Rows) error {
		var i jiraIssue
		var raw string
		if err := r.Scan(&i.ID, &i.Key, &i.Type, &i.Summary, &i.Description, &i.Status, &i.Priority, &i.Labels, &i.Difficulty,
			&i.Points, &i.ParentKey, &i.DueDate, &i.Created, &i.Updated, &i.Resolution, &i.EstimateSec, &raw); err != nil {
			return err
		}
		var rj struct {
			Fields map[string]any `json:"fields"`
		}
		_ = json.Unmarshal([]byte(raw), &rj)                      // a row without readable fields just has no rank
		if v, ok := rj.Fields["customfield_10019"].(string); ok { // Rank (Jira's board order)
			i.Rank = v
		}
		if v, ok := rj.Fields["customfield_10015"].(string); ok { // Start date
			i.StartDate = v
		}
		ex.Issues = append(ex.Issues, i)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("issues: %w", err)
	}
	err = scanInto(ctx, src, `SELECT issue_key, created, COALESCE(from_value,''), COALESCE(to_value,'') FROM changelog
		WHERE field = 'status' ORDER BY issue_key, created, history_id`, func(r *sql.Rows) error {
		var c jiraStatusChange
		err := r.Scan(&c.Key, &c.At, &c.From, &c.To)
		ex.Changes[c.Key] = append(ex.Changes[c.Key], c)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("changelog: %w", err)
	}
	err = scanInto(ctx, src, `SELECT id, issue_key, COALESCE(started,''), COALESCE(date,''), COALESCE(comment,''),
		COALESCE(time_spent_seconds,0) FROM worklogs ORDER BY started`, func(r *sql.Rows) error {
		var w jiraWorklog
		err := r.Scan(&w.ID, &w.Key, &w.Started, &w.Date, &w.Comment, &w.Seconds)
		ex.Worklogs = append(ex.Worklogs, w)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("worklogs: %w", err)
	}
	err = scanInto(ctx, src, `SELECT issue_key, COALESCE(author,''), COALESCE(body,''), COALESCE(created,'') FROM comments
		ORDER BY created`, func(r *sql.Rows) error {
		var c jiraComment
		err := r.Scan(&c.Key, &c.Author, &c.Body, &c.Created)
		ex.Comments[c.Key] = append(ex.Comments[c.Key], c)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("comments: %w", err)
	}
	err = scanInto(ctx, src, `SELECT issue_key, COALESCE(link_type,''), COALESCE(direction,''), COALESCE(other_key,'') FROM issue_links`,
		func(r *sql.Rows) error {
			var l jiraLink
			err := r.Scan(&l.Key, &l.Type, &l.Direction, &l.Other)
			ex.Links[l.Key] = append(ex.Links[l.Key], l)
			return err
		})
	if err != nil {
		return nil, fmt.Errorf("issue_links: %w", err)
	}
	// Board order: Jira's rank strings sort lexically.
	sort.SliceStable(ex.Issues, func(a, b int) bool { return ex.Issues[a].Rank < ex.Issues[b].Rank })
	return ex, nil
}

// jiraTime converts Jira's "2026-01-14T18:41:44.578+0530" to our UTC format.
func jiraTime(s string) (string, error) {
	for _, layout := range []string{"2006-01-02T15:04:05.000-0700", "2006-01-02T15:04:05-0700", time.RFC3339Nano} {
		if t, err := time.Parse(layout, s); err == nil {
			return FormatTime(t), nil
		}
	}
	return "", fmt.Errorf("unreadable Jira timestamp %q", s)
}

// jiraLabel is the first label, lower-cased ("MainJob" -> "mainjob").
func jiraLabel(labels string) string {
	var l []string
	_ = json.Unmarshal([]byte(labels), &l) // unreadable labels count as none
	if len(l) == 0 {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(l[0]))
}

// jiraPoints reads story points, including "1/4" and "1/2".
func jiraPoints(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	if a, b, ok := strings.Cut(s, "/"); ok {
		n, err1 := strconv.ParseFloat(a, 64)
		d, err2 := strconv.ParseFloat(b, 64)
		if err1 != nil || err2 != nil || d == 0 {
			return 0, false
		}
		return n / d, true
	}
	v, err := strconv.ParseFloat(s, 64)
	return v, err == nil
}

// Jira's four levels on the 1-5 scale; 5 is left for "extreme".
var jiraDifficulty = map[string]int64{"easy": 1, "medium": 2, "hard": 3, "very hard": 4}
