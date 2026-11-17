package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Dashboards and widgets (Phase 2). A widget is a source (where its content
// comes from: a metric query, or a connected app's page) plus a
// visualisation; it has no data-fetching code of its own.

type Dashboard struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Position  int64     `json:"position"`
	IsBuiltin bool      `json:"is_builtin"`
	Widgets   []*Widget `json:"widgets"`
}

type Widget struct {
	ID          int64           `json:"id"`
	DashboardID int64           `json:"dashboard_id"`
	Title       *string         `json:"title"`
	Source      string          `json:"source"`
	Viz         string          `json:"viz"`
	Query       json.RawMessage `json:"query"`
	Options     json.RawMessage `json:"options"`
	X           int64           `json:"x"`
	Y           int64           `json:"y"`
	W           int64           `json:"w"`
	H           int64           `json:"h"`
	Position    int64           `json:"position"`
}

const widgetCols = `id, dashboard_id, title, source, viz, query, options, x, y, w, h, position`

func scanWidget(r interface{ Scan(...any) error }) (*Widget, error) {
	var w Widget
	var q, o string
	err := r.Scan(&w.ID, &w.DashboardID, &w.Title, &w.Source, &w.Viz, &q, &o, &w.X, &w.Y, &w.W, &w.H, &w.Position)
	w.Query, w.Options = json.RawMessage(q), json.RawMessage(o)
	return &w, err
}

// ParseWidgetQuery reads a stored widget query. Filter values may be a
// single string or number, or a list of them.
func ParseWidgetQuery(raw json.RawMessage) (MetricQuery, error) {
	var body struct {
		MetricQuery
		Filters map[string]json.RawMessage `json:"filters"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return MetricQuery{}, invalid("query must be a JSON object")
	}
	q := body.MetricQuery
	q.Filters = map[string][]string{}
	for k, v := range body.Filters {
		var list []any
		if json.Unmarshal(v, &list) != nil {
			var one any
			if json.Unmarshal(v, &one) != nil {
				return q, invalid("filter %s must be a value or a list", k)
			}
			if one == nil {
				continue
			}
			list = []any{one}
		}
		for _, x := range list {
			switch x := x.(type) {
			case string:
				q.Filters[k] = append(q.Filters[k], x)
			case float64:
				q.Filters[k] = append(q.Filters[k], fmt.Sprint(int64(x)))
			default:
				return q, invalid("filter %s values must be names or ids", k)
			}
		}
	}
	return q, nil
}

func (d *DB) ListDashboards(ctx context.Context) ([]*Dashboard, error) {
	dashboards, err := collect(ctx, d, `SELECT id, name, position, is_builtin FROM dashboard
		WHERE deleted_at IS NULL ORDER BY position, id`, func(r *sql.Rows) (*Dashboard, error) {
		var x Dashboard
		err := r.Scan(&x.ID, &x.Name, &x.Position, &x.IsBuiltin)
		x.Widgets = []*Widget{}
		return &x, err
	})
	if err != nil {
		return nil, err
	}
	byID := map[int64]*Dashboard{}
	for _, x := range dashboards {
		byID[x.ID] = x
	}
	err = scanInto(ctx, d, `SELECT `+widgetCols+` FROM widget WHERE deleted_at IS NULL ORDER BY position, y, x, id`,
		func(r *sql.Rows) error {
			w, err := scanWidget(r)
			if err != nil {
				return err
			}
			if x := byID[w.DashboardID]; x != nil {
				x.Widgets = append(x.Widgets, w)
			}
			return nil
		})
	return dashboards, err
}

func (d *DB) GetDashboard(ctx context.Context, id int64) (*Dashboard, error) {
	all, err := d.ListDashboards(ctx)
	if err != nil {
		return nil, err
	}
	for _, x := range all {
		if x.ID == id {
			return x, nil
		}
	}
	return nil, ErrNotFound
}

var dashboardColumns = columns{"name": kText, "position": kInt}

func (d *DB) CreateDashboard(ctx context.Context, f Fields) (*Dashboard, error) {
	if _, ok := f["position"]; !ok {
		var next int64
		if err := d.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), -1) + 1 FROM dashboard WHERE deleted_at IS NULL`).Scan(&next); err != nil {
			return nil, err
		}
		f["position"], _ = json.Marshal(next)
	}
	id, err := d.insertRow(ctx, "dashboard", f, dashboardColumns)
	if err != nil {
		return nil, err
	}
	return d.GetDashboard(ctx, id)
}

func (d *DB) PatchDashboard(ctx context.Context, id int64, f Fields) (*Dashboard, error) {
	if err := d.exists(ctx, "dashboard", id); err != nil {
		return nil, err
	}
	if err := d.patchRow(ctx, "dashboard", id, f, dashboardColumns); err != nil {
		return nil, err
	}
	return d.GetDashboard(ctx, id)
}

// DeleteDashboard soft-deletes a dashboard, built-in ones included.
func (d *DB) DeleteDashboard(ctx context.Context, id int64) error {
	return d.softDelete(ctx, "dashboard", id)
}

var widgetColumns = columns{
	"dashboard_id": kInt, "title": kTextNull, "source": kText, "viz": kText, "query": kJSONObject, "options": kJSONObject,
	"x": kInt, "y": kInt, "w": kInt, "h": kInt, "position": kInt,
}

// WidgetSources are where a widget's content can come from (migration 019).
// Every source is built; one this version does not know comes from a newer
// device and can only be moved, renamed or removed here.
const (
	SourceMetric  = "metric"
	SourceAppPage = "app_page"
)

var WidgetSources = []string{SourceMetric, SourceView, SourceAppData, SourceAppPage, SourceJournal}

// builtSources can be saved today.
var builtSources = []string{SourceMetric, SourceView, SourceAppPage, SourceAppData, SourceJournal}

// checkWidget rejects a source or viz that does not exist and a query the
// metrics API would refuse, so a saved widget never fails for its shape.
// cur is the widget being changed (nil for a new one): a patch's query is
// checked against the source the widget already has.
func checkWidget(f Fields, cur *Widget) error {
	source := SourceMetric
	if cur != nil {
		source = cur.Source
	}
	if v, ok, err := f.stringField("source"); err != nil {
		return err
	} else if ok {
		// The query means something else for each source, so a widget keeps
		// its source; another one is a new widget. Repeating its own source
		// (even one this version does not know) changes nothing.
		if cur != nil && v != cur.Source {
			if !contains(WidgetSources, v) {
				return invalid("source must be one of %s", strings.Join(WidgetSources, ", "))
			}
			return invalid("a widget's source cannot be changed; add a new widget instead")
		}
		if cur == nil && !contains(WidgetSources, v) {
			return invalid("source must be one of %s", strings.Join(WidgetSources, ", "))
		}
		source = v
	}
	_, hasViz := f["viz"]
	_, hasQuery := f["query"]
	if !contains(builtSources, source) && (hasViz || hasQuery) {
		// A widget made by a newer Reskon: it can be moved, renamed or
		// removed here, not changed.
		return invalid("widgets with source %q are not available yet", source)
	}
	if v, ok, err := f.stringField("viz"); err != nil {
		return err
	} else if ok && source == SourceAppPage && v != VizPage {
		return invalid("an app page widget's viz is %q", VizPage)
	} else if ok && source == SourceView && v != VizBoard {
		return invalid("a view widget's viz is %q", VizBoard)
	} else if ok && source == SourceJournal && v != VizJournal {
		return invalid("a journal widget's viz is %q", VizJournal)
	} else if ok && source == SourceAppData && !appDataVizAny(v) {
		// Which of these suits the app's shape is checked by the API.
		return invalid("an app data widget's viz must be one of number, bar, line, cumulative, split_bar, table, list, checklist")
	} else if ok && source == SourceMetric && !contains(WidgetVizzes, v) {
		return invalid("viz must be one of %s", strings.Join(WidgetVizzes, ", "))
	}
	if raw, ok := f["query"]; ok {
		switch source {
		case SourceAppPage:
			if _, err := ParseAppPageQuery(raw); err != nil {
				return err
			}
		case SourceView:
			if _, err := ParseViewQuery(raw); err != nil {
				return err
			}
		case SourceJournal:
			if _, err := ParseJournalQuery(raw); err != nil {
				return err
			}
		case SourceAppData:
			if _, err := ParseAppDataQuery(raw); err != nil {
				return err
			}
		default:
			q, err := ParseWidgetQuery(raw)
			if err != nil {
				return err
			}
			if _, err := CheckMetricQuery(&q); err != nil {
				return err
			}
		}
	}
	if raw, ok := f["options"]; ok && source == SourceMetric && !isNull(raw) {
		if err := checkChartOptions(raw); err != nil {
			return err
		}
	}
	for _, k := range []string{"w", "h"} {
		if n, ok, err := f.int64Field(k); err != nil {
			return err
		} else if ok && (n < 1 || n > 12 && k == "w") {
			return invalid("%s is out of range", k)
		}
	}
	return nil
}

func (d *DB) GetWidget(ctx context.Context, id int64) (*Widget, error) {
	w, err := scanWidget(d.QueryRowContext(ctx, `SELECT `+widgetCols+` FROM widget WHERE id = ? AND deleted_at IS NULL`, id))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return w, err
}

func (d *DB) CreateWidget(ctx context.Context, f Fields) (*Widget, error) {
	src, _, _ := f.stringField("source")
	if _, ok := f["viz"]; !ok {
		// An app's page, a view's board and a journal draw themselves: one viz each.
		switch src {
		case SourceAppPage:
			f["viz"], _ = json.Marshal(VizPage)
		case SourceView:
			f["viz"], _ = json.Marshal(VizBoard)
		case SourceJournal:
			f["viz"], _ = json.Marshal(VizJournal)
		}
	}
	for _, req := range []string{"dashboard_id", "viz", "query"} {
		if _, ok := f[req]; !ok {
			return nil, invalid("%s is required", req)
		}
	}
	if err := checkWidget(f, nil); err != nil {
		return nil, err
	}
	dash, _, _ := f.int64Field("dashboard_id")
	if err := d.exists(ctx, "dashboard", dash); err != nil {
		return nil, invalid("dashboard %d does not exist", dash)
	}
	if src == SourceView {
		if err := d.checkViewExists(ctx, f); err != nil {
			return nil, err
		}
	}
	// A new widget goes below everything else unless placed.
	if _, ok := f["y"]; !ok {
		var bottom int64
		if err := d.QueryRowContext(ctx, `SELECT COALESCE(MAX(y + h), 0) FROM widget WHERE dashboard_id = ? AND deleted_at IS NULL`, dash).Scan(&bottom); err != nil {
			return nil, err
		}
		f["y"], _ = json.Marshal(bottom)
	}
	if _, ok := f["position"]; !ok {
		var next int64
		if err := d.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), -1) + 1 FROM widget WHERE dashboard_id = ? AND deleted_at IS NULL`, dash).Scan(&next); err != nil {
			return nil, err
		}
		f["position"], _ = json.Marshal(next)
	}
	id, err := d.insertRow(ctx, "widget", f, widgetColumns)
	if err != nil {
		return nil, err
	}
	return d.GetWidget(ctx, id)
}

func (d *DB) PatchWidget(ctx context.Context, id int64, f Fields) (*Widget, error) {
	cur, err := d.GetWidget(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := checkWidget(f, cur); err != nil {
		return nil, err
	}
	if cur.Source == SourceView {
		if err := d.checkViewExists(ctx, f); err != nil {
			return nil, err
		}
	}
	if err := d.patchRow(ctx, "widget", id, f, widgetColumns); err != nil {
		return nil, err
	}
	return d.GetWidget(ctx, id)
}

func (d *DB) DeleteWidget(ctx context.Context, id int64) error {
	return d.softDelete(ctx, "widget", id)
}

// LayoutItem is one widget's place after a drag or resize.
type LayoutItem struct {
	ID int64 `json:"id"`
	X  int64 `json:"x"`
	Y  int64 `json:"y"`
	W  int64 `json:"w"`
	H  int64 `json:"h"`
}

// SaveLayout writes x/y/w/h for a dashboard's widgets in one transaction,
// then sets each widget's single-column position to its reading order on
// the grid (top to bottom, left to right), so a phone shows the same order.
func (d *DB) SaveLayout(ctx context.Context, dashboardID int64, items []LayoutItem) (*Dashboard, error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for _, it := range items {
		if it.W < 1 || it.W > 12 || it.H < 1 || it.X < 0 || it.Y < 0 || it.X+it.W > 12 {
			return nil, invalid("widget %d: position is outside the 12-column grid", it.ID)
		}
		res, err := tx.ExecContext(ctx, `UPDATE widget SET x = ?, y = ?, w = ?, h = ? WHERE id = ? AND dashboard_id = ? AND deleted_at IS NULL`,
			it.X, it.Y, it.W, it.H, it.ID, dashboardID)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, invalid("widget %d is not on dashboard %d", it.ID, dashboardID)
		}
	}
	var order []LayoutItem
	if err := scanInto(ctx, tx, `SELECT id, x, y FROM widget WHERE dashboard_id = ? AND deleted_at IS NULL`, func(r *sql.Rows) error {
		var it LayoutItem
		err := r.Scan(&it.ID, &it.X, &it.Y)
		order = append(order, it)
		return err
	}, dashboardID); err != nil {
		return nil, err
	}
	sort.Slice(order, func(i, j int) bool {
		if order[i].Y != order[j].Y {
			return order[i].Y < order[j].Y
		}
		return order[i].X < order[j].X
	})
	for i, it := range order {
		if _, err := tx.ExecContext(ctx, `UPDATE widget SET position = ? WHERE id = ?`, i, it.ID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetDashboard(ctx, dashboardID)
}

// WidgetQuery reads a saved widget's query: the client sends a widget id,
// not a query, the same way views are resolved.
func (d *DB) WidgetQuery(ctx context.Context, id int64) (MetricQuery, error) {
	w, err := d.GetWidget(ctx, id)
	if err != nil {
		return MetricQuery{}, err
	}
	if w.Source != SourceMetric {
		return MetricQuery{}, invalid("widget %d shows %s, not a metric", id, w.Source)
	}
	q, err := ParseWidgetQuery(w.Query)
	// A cumulative widget shows running totals, summed here, not in the
	// client; small multiples may ask for them in the query. Pies and share
	// bars get each value's part of its whole, also from here.
	q.Cumulative = q.Cumulative || w.Viz == "cumulative"
	q.Share = w.Viz == "pie" || w.Viz == "share_bar"
	return q, err
}
