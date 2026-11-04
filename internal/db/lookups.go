package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Lookup rows. All are user-editable; code branches on
// StatusCategory.Behaviour and EnergyType.Direction, never on a name.

type StatusCategory struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Behaviour string `json:"behaviour"`
	IsBuiltin bool   `json:"is_builtin"`
}

type Status struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	CategoryID     int64   `json:"category_id"`
	Color          *string `json:"color"`
	OnBoard        bool    `json:"on_board"`
	AlertAfterDays *int64  `json:"alert_after_days"`
	IsBuiltin      bool    `json:"is_builtin"`
	Position       int64   `json:"position"`
}

type Priority struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Color     *string `json:"color"`
	Weight    float64 `json:"weight"`
	Position  int64   `json:"position"`
	IsBuiltin bool    `json:"is_builtin"`
}

// EnergyType is one kind of energy. All types are equal: none is work or
// rest, and every one earns points at its own rate.
type EnergyType struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	Color         *string `json:"color"`
	Position      int64   `json:"position"`
	PointsPerHour float64 `json:"points_per_hour"`
}

type Subtype struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	EnergyTypeID int64  `json:"energy_type_id"`
	Position     int64  `json:"position"`
}

type Area struct {
	ID                  int64   `json:"id"`
	Name                string  `json:"name"`
	KeyPrefix           string  `json:"key_prefix"`
	Color               *string `json:"color"`
	DefaultEnergyTypeID *int64  `json:"default_energy_type_id"`
	Position            int64   `json:"position"`
}

type View struct {
	ID         int64           `json:"id"`
	Name       string          `json:"name"`
	Layout     string          `json:"layout"`
	Filter     json.RawMessage `json:"filter"`
	CardConfig json.RawMessage `json:"card_config"`
	BoardState json.RawMessage `json:"board_state"` // collapsed columns, grouping; saved as you use the view
	Position   int64           `json:"position"`
	Icon       json.RawMessage `json:"icon"`
	Color      *string         `json:"color"`
	Background json.RawMessage `json:"background"`
}

type CustomField struct {
	ID       int64           `json:"id"`
	Entity   string          `json:"entity"`
	Key      string          `json:"key"`
	Label    string          `json:"label"`
	Type     string          `json:"type"`
	Options  json.RawMessage `json:"options"`
	Position int64           `json:"position"`
}

// Bootstrap is everything the client needs before it can render a screen.
type Bootstrap struct {
	Areas            []Area                     `json:"areas"`
	Statuses         []Status                   `json:"statuses"`
	StatusCategories []StatusCategory           `json:"status_categories"`
	Priorities       []Priority                 `json:"priorities"`
	EnergyTypes      []EnergyType               `json:"energy_types"`
	Subtypes         []Subtype                  `json:"subtypes"`
	Views            []View                     `json:"views"`
	CustomFields     []CustomField              `json:"custom_fields"`
	Settings         map[string]json.RawMessage `json:"settings"`
}

func (d *DB) Bootstrap(ctx context.Context) (*Bootstrap, error) {
	var b Bootstrap
	var err error
	if b.Areas, err = d.ListAreas(ctx); err != nil {
		return nil, err
	}
	if b.Statuses, err = d.ListStatuses(ctx); err != nil {
		return nil, err
	}
	if b.StatusCategories, err = d.ListStatusCategories(ctx); err != nil {
		return nil, err
	}
	if b.Priorities, err = d.ListPriorities(ctx); err != nil {
		return nil, err
	}
	if b.EnergyTypes, err = d.ListEnergyTypes(ctx); err != nil {
		return nil, err
	}
	if b.Subtypes, err = d.ListSubtypes(ctx); err != nil {
		return nil, err
	}
	if b.Views, err = d.ListViews(ctx); err != nil {
		return nil, err
	}
	if b.CustomFields, err = d.ListCustomFields(ctx); err != nil {
		return nil, err
	}
	if b.Settings, err = d.Settings(ctx); err != nil {
		return nil, err
	}
	return &b, nil
}

// collect runs a query and scans every row with scan.
func collect[T any](ctx context.Context, q querier, query string, scan func(*sql.Rows) (T, error), args ...any) ([]T, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []T{}
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// querier is satisfied by both *sql.DB and *sql.Tx.
type querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (d *DB) ListStatusCategories(ctx context.Context) ([]StatusCategory, error) {
	return collect(ctx, d, `SELECT id, name, behaviour, is_builtin FROM status_category ORDER BY id`,
		func(r *sql.Rows) (c StatusCategory, err error) {
			err = r.Scan(&c.ID, &c.Name, &c.Behaviour, &c.IsBuiltin)
			return
		})
}

const statusCols = `id, name, category_id, color, on_board, alert_after_days, is_builtin, position`

func scanStatus(r interface{ Scan(...any) error }) (s Status, err error) {
	err = r.Scan(&s.ID, &s.Name, &s.CategoryID, &s.Color, &s.OnBoard, &s.AlertAfterDays, &s.IsBuiltin, &s.Position)
	return
}

func (d *DB) ListStatuses(ctx context.Context) ([]Status, error) {
	return collect(ctx, d, `SELECT `+statusCols+` FROM status WHERE deleted_at IS NULL ORDER BY position, id`,
		func(r *sql.Rows) (Status, error) { return scanStatus(r) })
}

func (d *DB) ListPriorities(ctx context.Context) ([]Priority, error) {
	return collect(ctx, d, `SELECT id, name, color, weight, position, is_builtin FROM priority
		WHERE deleted_at IS NULL ORDER BY position, id`,
		func(r *sql.Rows) (p Priority, err error) {
			err = r.Scan(&p.ID, &p.Name, &p.Color, &p.Weight, &p.Position, &p.IsBuiltin)
			return
		})
}

func (d *DB) ListEnergyTypes(ctx context.Context) ([]EnergyType, error) {
	return collect(ctx, d, `SELECT id, name, color, position, points_per_hour FROM energy_type
		WHERE deleted_at IS NULL ORDER BY position, id`,
		func(r *sql.Rows) (e EnergyType, err error) {
			err = r.Scan(&e.ID, &e.Name, &e.Color, &e.Position, &e.PointsPerHour)
			return
		})
}

func (d *DB) ListSubtypes(ctx context.Context) ([]Subtype, error) {
	return collect(ctx, d, `SELECT id, name, energy_type_id, position FROM subtype
		WHERE deleted_at IS NULL ORDER BY energy_type_id, position, id`,
		func(r *sql.Rows) (s Subtype, err error) {
			err = r.Scan(&s.ID, &s.Name, &s.EnergyTypeID, &s.Position)
			return
		})
}

const areaCols = `id, name, key_prefix, color, default_energy_type_id, position`

func scanArea(r interface{ Scan(...any) error }) (a Area, err error) {
	err = r.Scan(&a.ID, &a.Name, &a.KeyPrefix, &a.Color, &a.DefaultEnergyTypeID, &a.Position)
	return
}

func (d *DB) ListAreas(ctx context.Context) ([]Area, error) {
	return collect(ctx, d, `SELECT `+areaCols+` FROM area WHERE deleted_at IS NULL ORDER BY position, id`,
		func(r *sql.Rows) (Area, error) { return scanArea(r) })
}

func (d *DB) GetArea(ctx context.Context, id int64) (*Area, error) {
	a, err := scanArea(d.QueryRowContext(ctx, `SELECT `+areaCols+` FROM area WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &a, err
}

const viewCols = `id, name, layout, filter, card_config, position, board_state, icon, color, background`

func scanView(r interface{ Scan(...any) error }) (v View, err error) {
	var filter, card, board, icon, bg string
	err = r.Scan(&v.ID, &v.Name, &v.Layout, &filter, &card, &v.Position, &board, &icon, &v.Color, &bg)
	v.Filter, v.CardConfig, v.BoardState = json.RawMessage(filter), json.RawMessage(card), json.RawMessage(board)
	v.Icon, v.Background = json.RawMessage(icon), json.RawMessage(bg)
	return
}

func (d *DB) ListViews(ctx context.Context) ([]View, error) {
	return collect(ctx, d, `SELECT `+viewCols+` FROM view WHERE deleted_at IS NULL ORDER BY position, id`,
		func(r *sql.Rows) (View, error) { return scanView(r) })
}

func (d *DB) GetView(ctx context.Context, id int64) (*View, error) {
	v, err := scanView(d.QueryRowContext(ctx, `SELECT `+viewCols+` FROM view WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &v, err
}

const customFieldCols = `id, entity, key, label, type, options, position`

func scanCustomField(r interface{ Scan(...any) error }) (f CustomField, err error) {
	var opts sql.NullString
	err = r.Scan(&f.ID, &f.Entity, &f.Key, &f.Label, &f.Type, &opts, &f.Position)
	if opts.Valid {
		f.Options = json.RawMessage(opts.String)
	} else {
		f.Options = json.RawMessage("null")
	}
	return
}

func (d *DB) ListCustomFields(ctx context.Context) ([]CustomField, error) {
	return collect(ctx, d, `SELECT `+customFieldCols+` FROM custom_field
		WHERE deleted_at IS NULL ORDER BY entity, position, id`,
		func(r *sql.Rows) (CustomField, error) { return scanCustomField(r) })
}

// Settings returns every setting as raw JSON. llm_api_key is never returned;
// it is write-only from the client's point of view.
func (d *DB) Settings(ctx context.Context) (map[string]json.RawMessage, error) {
	rows, err := d.QueryContext(ctx, `SELECT key, value FROM setting WHERE key <> 'llm_api_key'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = json.RawMessage(v)
	}
	return out, rows.Err()
}

// Setting reads one setting into dst. It leaves dst alone and returns false
// when the key is absent.
func (d *DB) Setting(ctx context.Context, key string, dst any) (bool, error) {
	var v string
	err := d.QueryRowContext(ctx, `SELECT value FROM setting WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal([]byte(v), dst)
}

// PutSetting stores value (any JSON) under key.
func (d *DB) PutSetting(ctx context.Context, key string, value json.RawMessage) error {
	if !json.Valid(value) {
		return invalid("setting %s: value is not valid JSON", key)
	}
	if key == "task_dates" {
		if err := checkDateRules(value); err != nil {
			return err
		}
	}
	if key == "task_completeness" {
		if err := checkCompleteness(value); err != nil {
			return err
		}
	}
	if key == "snooze" {
		if err := checkSnoozeRules(value); err != nil {
			return err
		}
	}
	if key == "time_zone" {
		var name string
		if json.Unmarshal(value, &name) != nil {
			return invalid("time_zone must be a zone name such as \"Asia/Kolkata\"")
		}
		if _, err := time.LoadLocation(name); err != nil || name == "" {
			return invalid("time_zone %q is not a known time zone", name)
		}
	}
	_, err := d.ExecContext(ctx, `INSERT INTO setting (key, value) VALUES (?, ?)
		ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, string(value))
	return err
}
