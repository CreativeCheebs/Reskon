package db

import (
	"database/sql"
	"fmt"
	"strings"
)

// Jira import: areas, statuses, priorities and custom fields are reused by
// name when they exist and created when they don't.

func (im *importer) area(label string) (int64, *int64, error) {
	m, ok := jiraAreas[label]
	if !ok {
		name := strings.ToUpper(label[:1]) + label[1:]
		m = struct{ Name, Prefix, Energy string }{name, strings.ToUpper(firstN(label, 3)), "Admin"}
	}
	var id int64
	var energy sql.NullInt64
	err := im.tx.QueryRowContext(im.ctx, `SELECT id, default_energy_type_id FROM area WHERE lower(name) = lower(?) AND deleted_at IS NULL`,
		m.Name).Scan(&id, &energy)
	if err == nil {
		if energy.Valid {
			return id, &energy.Int64, nil
		}
		return id, nil, nil
	}
	if err != sql.ErrNoRows {
		return 0, nil, err
	}
	var eid int64
	if err := im.tx.QueryRowContext(im.ctx, `SELECT id FROM energy_type WHERE name = ? AND deleted_at IS NULL`, m.Energy).Scan(&eid); err != nil {
		return 0, nil, fmt.Errorf("energy type %s missing", m.Energy)
	}
	res, err := im.tx.ExecContext(im.ctx, `INSERT INTO area (name, key_prefix, default_energy_type_id) VALUES (?, ?, ?)`, m.Name, m.Prefix, eid)
	if err != nil {
		return 0, nil, fmt.Errorf("creating area %s (%s): %w", m.Name, m.Prefix, err)
	}
	id, _ = res.LastInsertId()
	filter := fmt.Sprintf(`{"areas":[%d],"statuses":null,"difficulty_min":null,"custom":null,"include_done_days":7}`, id)
	if _, err := im.tx.ExecContext(im.ctx, `INSERT INTO view (name, layout, filter, card_config, position) VALUES (?, 'board', ?, '{}', ?)`,
		m.Name, filter, id); err != nil {
		return 0, nil, err
	}
	im.created("area %s (key prefix %s, default energy type %s) and its board view", m.Name, m.Prefix, m.Energy)
	return id, &eid, nil
}

func (im *importer) status(jiraName string) (int64, error) {
	m, ok := jiraStatuses[strings.ToLower(jiraName)]
	if !ok {
		m = struct {
			Name, Behaviour string
			Position        int
		}{jiraName, "todo", 1}
	}
	var id int64
	err := im.tx.QueryRowContext(im.ctx, `SELECT id FROM status WHERE lower(name) = lower(?) AND deleted_at IS NULL`, m.Name).Scan(&id)
	if err == nil || err != sql.ErrNoRows {
		return id, err
	}
	var cat int64
	if err := im.tx.QueryRowContext(im.ctx, `SELECT id FROM status_category WHERE behaviour = ? ORDER BY id LIMIT 1`, m.Behaviour).Scan(&cat); err != nil {
		return 0, err
	}
	res, err := im.tx.ExecContext(im.ctx, `INSERT INTO status (name, category_id, color, on_board, position) VALUES (?, ?, '#a1a1aa', 1, ?)`,
		m.Name, cat, m.Position)
	if err != nil {
		return 0, err
	}
	id, _ = res.LastInsertId()
	im.created("status %s (%s, shown on the board)", m.Name, m.Behaviour)
	return id, nil
}

func (im *importer) priority(jiraName string) (int64, error) {
	m, ok := jiraPriorities[strings.ToLower(jiraName)]
	if !ok {
		m = struct {
			Name     string
			Weight   float64
			Position int
		}{jiraName, 1.0, 5}
	}
	var id int64
	err := im.tx.QueryRowContext(im.ctx, `SELECT id FROM priority WHERE lower(name) = lower(?) AND deleted_at IS NULL`, m.Name).Scan(&id)
	if err == nil || err != sql.ErrNoRows {
		return id, err
	}
	res, err := im.tx.ExecContext(im.ctx, `INSERT INTO priority (name, weight, position) VALUES (?, ?, ?)`, m.Name, m.Weight, m.Position)
	if err != nil {
		return 0, err
	}
	id, _ = res.LastInsertId()
	im.created("priority %s (weight %.2g)", m.Name, m.Weight)
	return id, nil
}

// customFields defines the fields that hold Jira data with no column here.
func (im *importer) customFields() error {
	for _, f := range []struct{ Key, Label, Type string }{
		{"jira_points", "Jira points", "real"},
		{"start_date", "Start date", "date"},
		{"jira_links", "Jira links", "text"},
	} {
		var one int
		err := im.tx.QueryRowContext(im.ctx, `SELECT 1 FROM custom_field WHERE entity = 'task' AND key = ?`, f.Key).Scan(&one)
		if err == nil {
			continue
		}
		if _, err := im.tx.ExecContext(im.ctx, `INSERT INTO custom_field (entity, key, label, type, position) VALUES ('task', ?, ?, ?, 10)`,
			f.Key, f.Label, f.Type); err != nil {
			return err
		}
		im.created("custom field %s (%s)", f.Label, f.Type)
	}
	return nil
}

func (im *importer) warn(format string, args ...any) {
	im.rep.Warnings = append(im.rep.Warnings, fmt.Sprintf(format, args...))
}

func (im *importer) created(format string, args ...any) {
	im.rep.Created = append(im.rep.Created, fmt.Sprintf(format, args...))
}

func firstN(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[:n]
}
