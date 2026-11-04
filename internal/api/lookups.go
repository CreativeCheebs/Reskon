package api

import (
	"context"
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) lookupRoutes() {
	s.crud("areas", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateArea(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return dbOf(ctx).PatchArea(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			return reassignDelete(ctx, r, id, dbOf(ctx).DeleteArea)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListAreas(ctx) },
	})
	s.crud("statuses", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateStatus(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchStatus(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			to, ok, err := queryID(r, "reassign_to")
			if err != nil {
				return err
			}
			if !ok {
				return dbOf(ctx).DeleteStatus(ctx, id, nil)
			}
			return dbOf(ctx).DeleteStatus(ctx, id, &to)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListStatuses(ctx) },
	})
	s.crud("status-categories", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateStatusCategory(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchStatusCategory(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			return dbOf(ctx).DeleteStatusCategory(ctx, id)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListStatusCategories(ctx) },
	})
	s.crud("priorities", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreatePriority(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchPriority(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			to, ok, err := queryID(r, "reassign_to")
			if err != nil {
				return err
			}
			clear := r.URL.Query().Get("clear") == "true"
			if !ok {
				return dbOf(ctx).DeletePriority(ctx, id, nil, clear)
			}
			return dbOf(ctx).DeletePriority(ctx, id, &to, clear)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListPriorities(ctx) },
	})
	s.crud("energy-types", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateEnergyType(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchEnergyType(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			return reassignDelete(ctx, r, id, dbOf(ctx).DeleteEnergyType)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListEnergyTypes(ctx) },
	})
	s.crud("subtypes", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateSubtype(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchSubtype(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			return reassignDelete(ctx, r, id, dbOf(ctx).DeleteSubtype)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListSubtypes(ctx) },
	})
	s.crud("custom-fields", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateCustomField(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return dbOf(ctx).PatchCustomField(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			return dbOf(ctx).DeleteCustomField(ctx, id)
		},
		list: func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListCustomFields(ctx) },
	})
	s.crud("views", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return dbOf(ctx).CreateView(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return dbOf(ctx).PatchView(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error { return dbOf(ctx).DeleteView(ctx, id) },
		list:   func(ctx context.Context, r *http.Request) (any, error) { return dbOf(ctx).ListViews(ctx) },
	})
}

// crudOps are the four operations behind a lookup collection.
type crudOps struct {
	list   func(ctx context.Context, r *http.Request) (any, error)
	create func(ctx context.Context, f db.Fields) (any, error)
	patch  func(ctx context.Context, id int64, f db.Fields) (any, error)
	delete func(ctx context.Context, id int64, r *http.Request) error
}

// crud registers GET/POST /api/{name} and PATCH/DELETE /api/{name}/{id}.
func (s *Server) crud(name string, ops crudOps) {
	base := "/api/" + name
	s.mux.HandleFunc("GET "+base, func(w http.ResponseWriter, r *http.Request) {
		v, err := ops.list(r.Context(), r)
		respond(w, v, err)
	})
	s.mux.HandleFunc("POST "+base, func(w http.ResponseWriter, r *http.Request) {
		f, err := decodeFields(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		v, err := ops.create(r.Context(), f)
		respond(w, v, err)
	})
	s.mux.HandleFunc("PATCH "+base+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		f, err := decodeFields(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		v, err := ops.patch(r.Context(), id, f)
		respond(w, v, err)
	})
	s.mux.HandleFunc("DELETE "+base+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			respond(w, nil, err)
			return
		}
		respond(w, map[string]bool{"ok": true}, ops.delete(r.Context(), id, r))
	})
}

// reassignDelete passes ?reassign_to=N, if given, to a delete that moves
// what uses the row first (see internal/db/reassign.go).
func reassignDelete(ctx context.Context, r *http.Request, id int64, del func(context.Context, int64, *int64) error) error {
	to, ok, err := queryID(r, "reassign_to")
	if err != nil {
		return err
	}
	if !ok {
		return del(ctx, id, nil)
	}
	return del(ctx, id, &to)
}
