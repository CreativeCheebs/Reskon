package api

import (
	"context"
	"net/http"
	"time"

	"jitterbug/internal/db"
)

// States (buffs, debuffs, modifiers) have no Phase 1 UI. Every response
// carries effective_severity for ?on=YYYY-MM-DD, default today.
func (s *Server) stateRoutes() {
	on := func(r *http.Request) string {
		if v := r.URL.Query().Get("on"); v != "" {
			return v
		}
		return time.Now().Format("2006-01-02")
	}
	s.crud("states", crudOps{
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListStates(ctx, on(r)) },
		create: func(ctx context.Context, f db.Fields) (any, error) {
			return dbOf(ctx).CreateState(ctx, f, time.Now().Format("2006-01-02"))
		},
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchState(ctx, id, f, time.Now().Format("2006-01-02"))
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error { return dbOf(ctx).DeleteState(ctx, id) },
	})
	s.mux.HandleFunc("GET /api/states/shapes", func(w http.ResponseWriter, r *http.Request) {
		respond(w, db.DecayShapes(), nil)
	})
}
