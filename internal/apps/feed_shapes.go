package apps

import (
	"encoding/json"
	"strconv"

	"jitterbug/internal/db"
)

// The table, checklist and list shapes of a data widget's answer
// (docs/plugins.md section 6.2), and the result as a chart type draws it.
// The checks and caps are in feed_answer.go.

func parseTable(a *rawAnswer, out *DataResult) error {
	if len(a.Columns) == 0 || len(a.Columns) > maxColumns {
		return invalid("a table needs 1 to %d columns", maxColumns)
	}
	if len(a.Rows) > maxRows {
		return invalid("the answer has more than %d rows", maxRows)
	}
	t := &Table{Columns: []Column{}, Rows: []map[string]any{}}
	seen := map[string]bool{}
	for i, c := range a.Columns {
		where := "column " + strconv.Itoa(i+1)
		if !columnKey.MatchString(c.Key) || seen[c.Key] {
			return invalid("%s: the key must be 1 to 40 letters, digits or _, and not used twice", where)
		}
		seen[c.Key] = true
		col := Column{Key: c.Key}
		var err error
		if col.Label, err = text(where+": the label", c.Label, maxLabel, false); err != nil {
			return err
		}
		if col.Label == "" {
			col.Label = c.Key
		}
		if col.Unit, err = text(where+": the unit", c.Unit, maxUnit, false); err != nil {
			return err
		}
		t.Columns = append(t.Columns, col)
	}
	for i, r := range a.Rows {
		where := "row " + strconv.Itoa(i+1)
		row := map[string]any{}
		for _, c := range t.Columns {
			v, err := cell(where+", column "+c.Key, r[c.Key])
			if err != nil {
				return err
			}
			row[c.Key] = v
		}
		t.Rows = append(t.Rows, row)
	}
	out.Table = t
	out.Total = float64(len(t.Rows))
	out.Reduce = "count"
	return nil
}

// cell reads one table value: text, a number, true/false, or nothing.
// Lists and objects are refused; a key the columns do not name is dropped.
func cell(where string, raw json.RawMessage) (any, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, invalid("%s cannot be read", where)
	}
	switch x := v.(type) {
	case string:
		s, err := text(where, x, maxDetail, false)
		return s, err
	case float64:
		n, err := number(where, &x)
		return n, err
	case bool:
		return x, nil
	}
	return nil, invalid("%s must be text, a number, true or false", where)
}

func parseChecklist(a *rawAnswer, out *DataResult) error {
	if len(a.Items) > maxItems {
		return invalid("the answer has more than %d items", maxItems)
	}
	seen := map[string]bool{}
	done := 0.0
	for i, it := range a.Items {
		where := "item " + strconv.Itoa(i+1)
		var p db.MetricPoint
		var err error
		if p.Key, err = text(where+": the key", it.Key, maxKey, false); err != nil {
			return err
		}
		if p.Key == "" {
			p.Key = strconv.Itoa(i + 1)
		}
		if seen[p.Key] {
			return invalid("%s: the key appears twice", where)
		}
		seen[p.Key] = true
		if p.Label, err = text(where+": the label", it.Label, maxLabel, true); err != nil {
			return err
		}
		if p.Detail, err = text(where+": the detail", it.Detail, maxDetail, false); err != nil {
			return err
		}
		if it.Done == nil {
			return invalid("%s: done must be true or false", where)
		}
		if *it.Done {
			p.Value = 1
			done++
		}
		out.Points = append(out.Points, p)
	}
	// The figure for a checklist is how many are done.
	out.Total = done
	out.Unit = "count"
	return nil
}

func parseList(a *rawAnswer, out *DataResult) error {
	if len(a.Items) > maxItems {
		return invalid("the answer has more than %d items", maxItems)
	}
	for i, it := range a.Items {
		where := "item " + strconv.Itoa(i+1)
		p := db.MetricPoint{Key: strconv.Itoa(i + 1)}
		var err error
		if p.Label, err = text(where+": the label", it.Label, maxLabel, true); err != nil {
			return err
		}
		// The value is text ("21 days"); a plain number is shown as written.
		v, err := cell(where+": the value", it.Value)
		if err != nil {
			return err
		}
		switch x := v.(type) {
		case string:
			p.Detail = x
		case float64:
			p.Detail = strconv.FormatFloat(x, 'f', -1, 64)
		case bool:
			return invalid("%s: the value must be text or a number", where)
		}
		out.Points = append(out.Points, p)
	}
	out.Total = float64(len(out.Points))
	out.Reduce = "count"
	return nil
}

// ForViz is the result as one chart type draws it. A cumulative chart gets
// running totals worked out here, as the metrics API does for its own: the
// browser only draws.
func (r *DataResult) ForViz(viz string) *DataResult {
	if viz != "cumulative" || r.Shape != "series" {
		return r
	}
	c := *r
	c.Points = make([]db.MetricPoint, len(r.Points))
	run := map[string]float64{}
	for i, p := range r.Points {
		run[p.Split] += p.Value
		p.Value = run[p.Split]
		c.Points[i] = p
	}
	c.Cumulative = true
	return &c
}
