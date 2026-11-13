package api

import (
	"net/http"
	"strings"

	"jitterbug/internal/db"
)

func (s *Server) metricRoutes() {
	s.mux.HandleFunc("GET /api/metrics", s.getMetric)
	s.mux.HandleFunc("GET /api/metrics/catalog", func(w http.ResponseWriter, r *http.Request) {
		respond(w, dbOf(r.Context()).MetricCatalog(), nil)
	})
}

// getMetric: ?widget=:id runs a saved widget's query (what widgets send),
// or the query in full for the widget editor's preview:
// ?metric=&group=&range= (or from=&to=)&split=&reduce=&cumulative=1&share=1
// and filters as filters[name]=value, repeated or comma-separated. Filter
// values are ids, or names matched without regard to case (the tag filter takes ids only, and 0 means
// "no tags"). A widget may be
// given from=&to= too: the dashboard's date picker runs every widget over
// those dates instead of its own range.
func (s *Server) getMetric(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	if id, ok, err := queryID(r, "widget"); err != nil || ok {
		if err != nil {
			respond(w, nil, err)
			return
		}
		q, err := dbOf(r.Context()).WidgetQuery(r.Context(), id)
		if err != nil {
			respond(w, nil, err)
			return
		}
		if v.Get("from") != "" || v.Get("to") != "" {
			q.Range, q.From, q.To = "", v.Get("from"), v.Get("to")
		}
		res, err := dbOf(r.Context()).Metric(r.Context(), q, dbOf(r.Context()).Now(r.Context()))
		respond(w, res, err)
		return
	}
	q := db.MetricQuery{
		Metric: v.Get("metric"), Group: v.Get("group"), Range: v.Get("range"),
		From: v.Get("from"), To: v.Get("to"), Split: v.Get("split"), Reduce: v.Get("reduce"),
		Cumulative: v.Get("cumulative") == "1" || v.Get("cumulative") == "true",
		Share:      v.Get("share") == "1" || v.Get("share") == "true",
		Filters:    map[string][]string{},
	}
	for key, values := range v {
		name, ok := strings.CutPrefix(key, "filters[")
		if !ok || !strings.HasSuffix(name, "]") {
			continue
		}
		name = strings.TrimSuffix(name, "]")
		for _, val := range values {
			for _, part := range strings.Split(val, ",") {
				if part = strings.TrimSpace(part); part != "" {
					q.Filters[name] = append(q.Filters[name], part)
				}
			}
		}
	}
	res, err := dbOf(r.Context()).Metric(r.Context(), q, dbOf(r.Context()).Now(r.Context()))
	respond(w, res, err)
}
