package api

import (
	"context"
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) dashboardRoutes() {
	s.crud("dashboards", crudOps{
		list:   func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListDashboards(ctx) },
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateDashboard(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchDashboard(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error { return dbOf(ctx).DeleteDashboard(ctx, id) },
	})
	s.mux.HandleFunc("PATCH /api/dashboards/{id}/layout", s.saveLayout)
	s.crud("widgets", crudOps{
		list: func(ctx context.Context, r *http.Request) (any, error) {
			return nil, &db.InvalidError{Msg: "widgets come with GET /api/dashboards"}
		},
		create: func(ctx context.Context, f db.Fields) (any, error) {
			if err := s.checkAppPage(ctx, nil, f); err != nil {
				return nil, err
			}
			return dbOf(ctx).CreateWidget(ctx, f)
		},
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			cur, err := dbOf(ctx).GetWidget(ctx, id)
			if err != nil {
				return nil, err
			}
			if err := s.checkAppPage(ctx, cur, f); err != nil {
				return nil, err
			}
			return dbOf(ctx).PatchWidget(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error { return dbOf(ctx).DeleteWidget(ctx, id) },
	})
}

// saveLayout: {"items": [{id, x, y, w, h}, ...]} after a drag or resize.
// One call for the whole dashboard, not one per widget.
func (s *Server) saveLayout(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body struct {
		Items []db.LayoutItem `json:"items"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).SaveLayout(r.Context(), id, body.Items)
	respond(w, v, err)
}
