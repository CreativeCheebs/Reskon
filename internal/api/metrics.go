package api

import (
	"net/http"
	"strings"
	"time"

	"jitterbug/internal/db"
)

func (s *Server) metricRoutes() {
	s.mux.HandleFunc("GET /api/metrics", s.getMetric)
	s.mux.HandleFunc("GET /api/metrics/catalog", func(w http.ResponseWriter, r *http.Request) {
		respond(w, dbOf(r.Context()).MetricCatalog(), nil)
	})
}

// getMetric: ?metric=&group=&range= (or from=&to=)&split=&reduce=&cumulative=1
// and filters as filters[name]=value, repeated or comma-separated. Filter
// values are ids, or names matched without regard to case.
func (s *Server) getMetric(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	q := db.MetricQuery{
		Metric: v.Get("metric"), Group: v.Get("group"), Range: v.Get("range"),
		From: v.Get("from"), To: v.Get("to"), Split: v.Get("split"), Reduce: v.Get("reduce"),
		Cumulative: v.Get("cumulative") == "1" || v.Get("cumulative") == "true",
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
	res, err := dbOf(r.Context()).Metric(r.Context(), q, time.Now())
	respond(w, res, err)
}
