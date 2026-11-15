package api

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"

	"jitterbug/internal/apps"
	"jitterbug/internal/db"
)

// App page widgets: a connected app's own small page on a dashboard
// (docs/plugins.md section 4). The database checks the widget's shape;
// here the app and its page are checked against the person's apps file, and
// the page's address is worked out with a fresh ticket each time it is shown.

func (s *Server) appPageRoutes() {
	// POST because each call spends one of the app's tickets; it changes none
	// of the person's data, so it sends no live note (live.go noChange):
	// otherwise each launch would reload every other tab, which would launch
	// again.
	s.mux.HandleFunc("POST /api/apps/launch", s.appsHandler(func(st *apps.Store, w http.ResponseWriter, r *http.Request) {
		var body struct {
			Widget int64 `json:"widget"`
		}
		if err := decodeBody(r, &body); err != nil {
			respond(w, nil, err)
			return
		}
		wd, err := dbOf(r.Context()).GetWidget(r.Context(), body.Widget)
		if err != nil {
			respond(w, nil, err)
			return
		}
		// A widget on a deleted dashboard is not shown anywhere.
		if _, err := dbOf(r.Context()).GetDashboard(r.Context(), wd.DashboardID); err != nil {
			respond(w, nil, err)
			return
		}
		if wd.Source != db.SourceAppPage {
			respond(w, nil, &db.InvalidError{Msg: "this widget is not an app's page"})
			return
		}
		q, err := db.ParseAppPageQuery(wd.Query)
		if err != nil {
			respond(w, nil, err)
			return
		}
		link, err := st.Launch(r.Context(), s.appClient(), q.App, q.Widget)
		if err == nil && sameHostPort(link.URL, r.Host) {
			// In a frame on Reskon's own address the sandbox would not hold.
			// (The browser checks again against the address it is on.)
			err = &apps.Invalid{Msg: "this app's page is on Reskon's own address, so Reskon will not show it"}
		}
		s.appPageRespond(w, link, err)
	}))
}

// sameHostPort says whether page is on host (a request's Host), ports
// filled in from the scheme. The scheme is not compared, as sameOrigin
// does not: refusing a little more is the safe side.
func sameHostPort(page, host string) bool {
	u, err := url.Parse(page)
	if err != nil {
		return true
	}
	withPort := func(h, scheme string) string {
		if _, _, err := net.SplitHostPort(h); err == nil {
			return h
		}
		if scheme == "https" {
			return net.JoinHostPort(h, "443")
		}
		return net.JoinHostPort(h, "80")
	}
	return withPort(u.Host, u.Scheme) == withPort(host, u.Scheme)
}

// appPageRespond is appRespond plus Gone (an app or page no longer there),
// which is a 404 with its reason. The app's refusal of Reskon's token is a
// 400, never a 401: the web app takes a 401 to mean Reskon signed you out.
func (s *Server) appPageRespond(w http.ResponseWriter, v any, err error) {
	var gone *apps.Gone
	if errors.As(err, &gone) {
		writeError(w, http.StatusNotFound, "not found", gone.Msg)
		return
	}
	s.appRespond(w, v, err)
}

// checkAppPage refuses to save an app page widget whose app is not
// connected for this person or does not offer that page. cur is the widget
// being changed, nil for a new one. Other sources pass straight through.
func (s *Server) checkAppPage(ctx context.Context, cur *db.Widget, f db.Fields) error {
	source := db.SourceMetric
	if cur != nil {
		source = cur.Source
	}
	if raw, ok := f["source"]; ok {
		_ = json.Unmarshal(raw, &source) // a bad value is refused by the database
	}
	raw, hasQuery := f["query"]
	if source != db.SourceAppPage || !hasQuery {
		return nil // a move, resize or new title needs no app
	}
	q, err := db.ParseAppPageQuery(raw)
	if err != nil {
		return err
	}
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
	if _, err := apps.PageWidget(a, q.Widget); err != nil {
		var inv *apps.Invalid
		var gone *apps.Gone
		switch {
		case errors.As(err, &inv):
			return &db.InvalidError{Msg: inv.Msg}
		case errors.As(err, &gone):
			return &db.InvalidError{Msg: a.Name + " offers no page \"" + q.Widget + "\""}
		}
		return err
	}
	return nil
}
