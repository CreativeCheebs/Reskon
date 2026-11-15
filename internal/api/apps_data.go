package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"jitterbug/internal/apps"
	"jitterbug/internal/db"
)

// App data widgets: numbers, lists, tables and checklists from a connected
// app, drawn by Reskon's own charts (docs/plugins.md section 6). The
// database checks the widget's shape; here the app, its data widget and the
// chart type are checked against the person's apps file, and the data is
// fetched (or the kept copy shown) each time the widget is drawn. Both
// routes are GET: they change none of the person's data, so they send no
// live note (one would make every open tab fetch again, forever).

func (s *Server) appDataRoutes() {
	// A saved widget, by id, as the dashboard draws it. from=&to= are the
	// dashboard's dates, which replace the widget's own range.
	s.mux.HandleFunc("GET /api/apps/data", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		if crossSite(w, r) {
			return
		}
		ctx := r.Context()
		id, ok, err := queryID(r, "widget")
		if err == nil && !ok {
			err = &db.InvalidError{Msg: "widget is required"}
		}
		if err != nil {
			respond(w, nil, err)
			return
		}
		wd, err := dbOf(ctx).GetWidget(ctx, id)
		if err != nil {
			respond(w, nil, err)
			return
		}
		if _, err := dbOf(ctx).GetDashboard(ctx, wd.DashboardID); err != nil {
			respond(w, nil, err) // a widget on a deleted dashboard is shown nowhere
			return
		}
		if wd.Source != db.SourceAppData {
			respond(w, nil, &db.InvalidError{Msg: "this widget does not show an app's data"})
			return
		}
		q, err := db.ParseAppDataQuery(wd.Query)
		if err != nil {
			respond(w, nil, err)
			return
		}
		v := r.URL.Query()
		res, err := st.Data(ctx, s.appClient(), s.dataRequest(ctx, q, wd.Viz, v.Get("from"), v.Get("to")))
		s.appPageRespond(w, res, err)
	}))
	// The widget editor's preview: the query in full, before it is saved.
	s.mux.HandleFunc("GET /api/apps/data/preview", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		if crossSite(w, r) {
			return
		}
		ctx := r.Context()
		v := r.URL.Query()
		raw, _ := json.Marshal(db.AppDataQuery{App: v.Get("app"), Widget: v.Get("widget"), Range: v.Get("range"), Group: v.Get("group")})
		q, err := db.ParseAppDataQuery(raw)
		if err == nil {
			err = s.checkAppDataQuery(ctx, q, v.Get("viz"))
		}
		if err != nil {
			respond(w, nil, err)
			return
		}
		res, err := st.Data(ctx, s.appClient(), s.dataRequest(ctx, q, v.Get("viz"), "", ""))
		s.appPageRespond(w, res, err)
	}))
}

// crossSite refuses a request another site's page made (a link or an image
// pointing here would otherwise make Reskon call the app and fill the
// cache with the person's sign-in). Browsers say where a request came from
// in Sec-Fetch-Site; Reskon's own page sends same-origin, a typed address
// none. Tools that send no such header are let through.
func crossSite(w http.ResponseWriter, r *http.Request) bool {
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
		return false
	}
	writeError(w, http.StatusForbidden, "forbidden", "an app's data can only be asked for from Reskon's own pages")
	return true
}

// dataRequest fills in the person's today and time zone.
func (s *Server) dataRequest(ctx context.Context, q db.AppDataQuery, viz, from, to string) apps.DataRequest {
	now := dbOf(ctx).Now(ctx)
	tz := now.Location().String()
	if tz == "Local" {
		// No time zone set yet (the browser sends it when it opens): an app
		// cannot read "Local", so it gets UTC, and today is UTC's today, so
		// the dates and the zone sent agree.
		tz, now = "UTC", now.UTC()
	}
	return apps.DataRequest{
		App: q.App, Widget: q.Widget, Range: q.Range, Group: q.Group, From: from, To: to,
		TZ: tz, Today: now.Format("2006-01-02"), Viz: viz,
	}
}

// checkAppData refuses to save an app data widget whose app is not
// connected for this person, does not offer that data, or whose chart type
// does not suit the data's shape. cur is the widget being changed, nil for
// a new one; a patch of only the chart type is checked against its saved
// query. Other sources pass straight through.
func (s *Server) checkAppData(ctx context.Context, cur *db.Widget, f db.Fields) error {
	source := db.SourceMetric
	if cur != nil {
		source = cur.Source
	}
	if raw, ok := f["source"]; ok {
		_ = json.Unmarshal(raw, &source) // a bad value is refused by the database
	}
	rawQuery, hasQuery := f["query"]
	rawViz, hasViz := f["viz"]
	if source != db.SourceAppData || !hasQuery && !hasViz {
		return nil // a move, resize or new title needs no app
	}
	if !hasQuery && cur != nil {
		rawQuery = cur.Query
	}
	var viz string
	if hasViz {
		if json.Unmarshal(rawViz, &viz) != nil {
			return &db.InvalidError{Msg: "viz must be text"}
		}
	} else if cur != nil {
		viz = cur.Viz
	}
	q, err := db.ParseAppDataQuery(rawQuery)
	if err != nil {
		return err
	}
	return s.checkAppDataQuery(ctx, q, viz)
}

// checkAppDataQuery checks an app data query and its chart type against the
// app's last description.
func (s *Server) checkAppDataQuery(ctx context.Context, q db.AppDataQuery, viz string) error {
	if !s.AppsEnabled {
		return &db.InvalidError{Msg: "connected apps are set up on the Reskon server, in the web app"}
	}
	st, err := s.Auth.AppsFor(ctx, userOf(ctx).ID)
	if err != nil {
		return err
	}
	a, err := st.GetByAppID(ctx, q.App)
	if errors.Is(err, apps.ErrNotFound) {
		return &db.InvalidError{Msg: "the app \"" + q.App + "\" is not connected; connect it in Settings › Apps first"}
	}
	if err != nil {
		return err
	}
	if a.Status == apps.StatusInvalid {
		return &db.InvalidError{Msg: "check " + a.Name + " again in Settings › Apps first: " + a.StatusDetail}
	}
	wd, err := apps.DataWidget(a, q.Widget)
	if err != nil {
		var inv *apps.Invalid
		var gone *apps.Gone
		switch {
		case errors.As(err, &inv):
			return &db.InvalidError{Msg: inv.Msg}
		case errors.As(err, &gone):
			return &db.InvalidError{Msg: a.Name + " offers no data \"" + q.Widget + "\""}
		}
		return err
	}
	if fits := db.AppDataVizzes[wd.Shape]; !contains(fits, viz) {
		return &db.InvalidError{Msg: "a " + wd.Shape + " from an app can be shown as " + strings.Join(fits, ", ")}
	}
	if q.Range != "" && !wd.Ranged {
		return &db.InvalidError{Msg: a.Name + "'s \"" + wd.Title + "\" has no date range"}
	}
	if q.Group != "" && !contains(wd.Groups, q.Group) {
		if len(wd.Groups) == 0 {
			return &db.InvalidError{Msg: a.Name + "'s \"" + wd.Title + "\" cannot be grouped"}
		}
		return &db.InvalidError{Msg: a.Name + "'s \"" + wd.Title + "\" can be grouped by " + strings.Join(wd.Groups, ", ")}
	}
	return nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
