package api

import (
	"net/http"

	"jitterbug/internal/db"
)

// GET /api/journal is what you did each day, from your sessions and their
// notes (SPEC 6.4 and 10.1). Two ways to ask:
//
//	?from=&to=            those dates, the newest 366 days with sessions
//	                      (the Sessions screen's Copy as Markdown)
//	?widget=:id           a saved journal widget, over its own range, or over
//	                      &from=&to= when the dashboard's dates are on; at
//	                      most the newest 62 days with sessions
//
// Each day carries its totals and its Markdown, worked out on the server.
// It only reads, so it sends no live note.
func (s *Server) journalRoutes() {
	s.mux.HandleFunc("GET /api/journal", func(w http.ResponseWriter, r *http.Request) {
		ctx, v := r.Context(), r.URL.Query()
		var out *db.Journal
		id, ok, err := queryID(r, "widget")
		switch {
		case err != nil:
		case ok:
			out, err = dbOf(ctx).JournalForWidget(ctx, id, v.Get("from"), v.Get("to"))
		default:
			out, err = dbOf(ctx).Journal(ctx, v.Get("from"), v.Get("to"), 0)
		}
		respond(w, out, err)
	})
}
