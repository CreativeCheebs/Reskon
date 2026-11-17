package db

import "strings"

// checkVizSuitsMetric keeps a two-series metric on its own chart type (the
// combined chart) and that chart type on such a metric. It looks at the
// viz and query being saved, else the ones the widget already has.
func checkVizSuitsMetric(f Fields, cur *Widget) error {
	viz, _, _ := f.stringField("viz")
	rawQuery, hasQuery := f["query"]
	if cur != nil {
		if viz == "" {
			viz = cur.Viz
		}
		if !hasQuery {
			rawQuery = cur.Query
		}
	}
	q, err := ParseWidgetQuery(rawQuery)
	if err != nil {
		return nil // the query check reports it
	}
	m, ok := metricRegistry[q.Metric]
	if !ok {
		return nil
	}
	if len(m.Vizzes) > 0 && !contains(m.Vizzes, viz) {
		return invalid("%s is drawn as %s", m.Name, strings.Join(m.Vizzes, " or "))
	}
	if len(m.Vizzes) == 0 && viz == VizCombo {
		return invalid("the %s chart needs a metric with two series (points and hours)", VizCombo)
	}
	return nil
}
