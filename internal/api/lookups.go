package api

import (
	"context"
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) lookupRoutes() {
	s.crud("areas", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateArea(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchArea(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteArea(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListAreas(ctx) },
	})
	s.crud("statuses", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateStatus(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchStatus(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			to, ok, err := queryID(r, "reassign_to")
			if err != nil {
				return err
			}
			if !ok {
				return s.DB.DeleteStatus(ctx, id, nil)
			}
			return s.DB.DeleteStatus(ctx, id, &to)
		},
		list: func(ctx context.Context) (any, error) { return s.DB.ListStatuses(ctx) },
	})
	s.crud("status-categories", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateStatusCategory(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return s.DB.PatchStatusCategory(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteStatusCategory(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListStatusCategories(ctx) },
	})
	s.crud("priorities", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreatePriority(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchPriority(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error {
			to, ok, err := queryID(r, "reassign_to")
			if err != nil {
				return err
			}
			clear := r.URL.Query().Get("clear") == "true"
			if !ok {
				return s.DB.DeletePriority(ctx, id, nil, clear)
			}
			return s.DB.DeletePriority(ctx, id, &to, clear)
		},
		list: func(ctx context.Context) (any, error) { return s.DB.ListPriorities(ctx) },
	})
	s.crud("energy-types", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateEnergyType(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchEnergyType(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteEnergyType(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListEnergyTypes(ctx) },
	})
	s.crud("subtypes", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateSubtype(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchSubtype(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteSubtype(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListSubtypes(ctx) },
	})
	s.crud("custom-fields", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateCustomField(ctx, f) },
		patch: func(ctx context.Context, id int64, f db.Fields) (any, error) {
			return s.DB.PatchCustomField(ctx, id, f)
		},
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteCustomField(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListCustomFields(ctx) },
	})
	s.crud("views", crudOps{
		create: func(ctx context.Context, f db.Fields) (any, error) { return s.DB.CreateView(ctx, f) },
		patch:  func(ctx context.Context, id int64, f db.Fields) (any, error) { return s.DB.PatchView(ctx, id, f) },
		delete: func(ctx context.Context, id int64, r *http.Request) error { return s.DB.DeleteView(ctx, id) },
		list:   func(ctx context.Context) (any, error) { return s.DB.ListViews(ctx) },
	})
}

// crudOps are the four operations behind a lookup collection.
type crudOps struct {
	list   func(ctx context.Context) (any, error)
	create func(ctx context.Context, f db.Fields) (any, error)
	patch  func(ctx context.Context, id int64, f db.Fields) (any, error)
	delete func(ctx context.Context, id int64, r *http.Request) error
}

// crud registers GET/POST /api/{name} and PATCH/DELETE /api/{name}/{id}.
func (s *Server) crud(name string, ops crudOps) {
	base := "/api/" + name
	s.mux.HandleFunc("GET "+base, func(w http.ResponseWriter, r *http.Request) {
		v, err := ops.list(r.Context())
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
