package apps

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"jitterbug/internal/db"
)

// A data widget's answer (docs/plugins.md section 6.2), checked strictly
// before Reskon stores or shows any of it, then put in the metrics' result
// shape so Reskon's own charts draw it. Messages here are Reskon's words:
// none of the app's text goes into them.

// DataResult is what the browser gets for an app data widget: a metric
// result (points, series, total) plus, for a table, its columns and rows,
// and when the app made the answer.
type DataResult struct {
	db.MetricResult
	Shape string `json:"shape"`
	// Label is the app's own heading for a number or checklist ("Today").
	Label string `json:"label,omitempty"`
	Table *Table `json:"table,omitempty"`
	// FetchedAt is when the app made the answer (UTC, whole seconds).
	FetchedAt string `json:"fetched_at"`
	// AppName is the app's name, for the widget's own words ("Habits sent
	// nothing to show"). Not kept in the cache; set when answering.
	AppName string `json:"app_name,omitempty"`
	// Stale means the app could not be asked just now, and this is the copy
	// Reskon kept; StaleReason says why, in Reskon's words.
	Stale       bool   `json:"stale,omitempty"`
	StaleReason string `json:"stale_reason,omitempty"`
}

// Table is a table shape's columns and rows. Each row holds only the
// columns' keys, each a string, a number, true/false or null.
type Table struct {
	Columns []Column         `json:"columns"`
	Rows    []map[string]any `json:"rows"`
}

type Column struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Unit  string `json:"unit,omitempty"`
}

// Caps on an answer. A year of days is 366 points; the rest leave room
// without letting one answer fill a dashboard.
const (
	maxPoints  = 2000
	maxSeries  = 24
	maxItems   = 500
	maxRows    = 500
	maxColumns = 12
	maxKey     = 100
	maxLabel   = 120
	maxDetail  = 200
	maxUnit    = 20
	maxNumber  = 1e12
)

type rawPoint struct {
	Key   string   `json:"key"`
	Label string   `json:"label"`
	Value *float64 `json:"value"`
	Split string   `json:"split"`
}

type rawSeries struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Color string `json:"color"`
}

type rawItem struct {
	Key    string          `json:"key"`
	Label  string          `json:"label"`
	Done   *bool           `json:"done"`
	Detail string          `json:"detail"`
	Value  json.RawMessage `json:"value"`
}

type rawAnswer struct {
	Shape     string                       `json:"shape"`
	Label     string                       `json:"label"`
	Unit      string                       `json:"unit"`
	Value     *float64                     `json:"value"`
	Points    []rawPoint                   `json:"points"`
	Series    []rawSeries                  `json:"series"`
	Total     *float64                     `json:"total"`
	Columns   []Column                     `json:"columns"`
	Rows      []map[string]json.RawMessage `json:"rows"`
	Items     []rawItem                    `json:"items"`
	FetchedAt string                       `json:"fetched_at"`
}

var (
	columnKey = regexp.MustCompile(`^[A-Za-z0-9_]{1,40}$`)
	hexColor  = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

// text trims and checks one text field of an answer.
func text(field, s string, max int, required bool) (string, error) {
	s = strings.TrimSpace(s)
	return s, plainText(field, s, max, required)
}

func number(field string, v *float64) (float64, error) {
	if v == nil {
		return 0, invalid("%s is missing", field)
	}
	if math.IsNaN(*v) || math.IsInf(*v, 0) || math.Abs(*v) > maxNumber {
		return 0, invalid("%s is out of range", field)
	}
	return *v, nil
}

// ParseAnswer checks an app's answer for a data widget of the given shape
// and converts it. group is the grouping asked for ("" if none), from and
// to the dates asked for (empty if the feed is not ranged), now the time of
// the request.
func ParseAnswer(data []byte, shape, group, from, to string, now time.Time) (*DataResult, error) {
	var a rawAnswer
	if err := json.Unmarshal(data, &a); err != nil {
		return nil, invalid("the answer is not in the contract's form (numbers must be JSON numbers, text must be text)")
	}
	if a.Shape != shape {
		return nil, invalid("the answer's shape is not the %s its description promises", shape)
	}
	out := &DataResult{Shape: shape, MetricResult: db.MetricResult{Group: group, From: from, To: to, Points: []db.MetricPoint{}, Series: []db.MetricSeries{}, Reduce: "sum"}}
	var err error
	if out.Unit, err = text("the unit", a.Unit, maxUnit, false); err != nil {
		return nil, err
	}
	if out.Label, err = text("the label", a.Label, maxLabel, false); err != nil {
		return nil, err
	}
	switch shape {
	case "number":
		err = parseNumber(&a, out)
	case "series":
		err = parseSeries(&a, out)
	case "table":
		err = parseTable(&a, out)
	case "checklist":
		err = parseChecklist(&a, out)
	case "list":
		err = parseList(&a, out)
	default:
		err = invalid("Reskon cannot draw the shape %q", short(shape))
	}
	if err != nil {
		return nil, err
	}
	out.FetchedAt = now.UTC().Format(time.RFC3339)
	if a.FetchedAt != "" {
		t, err := time.Parse(time.RFC3339Nano, a.FetchedAt)
		if err != nil {
			return nil, invalid("fetched_at must be a time such as 2026-11-15T08:30:00Z")
		}
		// Never later than the request: a clock ahead would make old data look new.
		if t.Before(now) {
			out.FetchedAt = t.UTC().Format(time.RFC3339)
		}
	}
	return out, nil
}

func parseNumber(a *rawAnswer, out *DataResult) error {
	v, err := number("the value", a.Value)
	if err != nil {
		return err
	}
	out.Reduce = "last"
	out.Total = v
	out.Points = []db.MetricPoint{{Key: "value", Label: out.Label, Value: v}}
	return nil
}

func parseSeries(a *rawAnswer, out *DataResult) error {
	if len(a.Points) > maxPoints {
		return invalid("the answer has more than %d points", maxPoints)
	}
	if len(a.Series) > maxSeries {
		return invalid("the answer has more than %d series", maxSeries)
	}
	split := len(a.Points) > 0 && a.Points[0].Split != ""
	seen := map[[2]string]bool{}
	sum := 0.0
	totals := map[string]float64{}
	for i, p := range a.Points {
		where := "point " + strconv.Itoa(i+1)
		var mp db.MetricPoint
		var err error
		if mp.Key, err = text(where+": the key", p.Key, maxKey, true); err != nil {
			return err
		}
		if mp.Label, err = text(where+": the label", p.Label, maxLabel, false); err != nil {
			return err
		}
		if mp.Label == "" {
			mp.Label = mp.Key
		}
		if mp.Split, err = text(where+": the split", p.Split, maxKey, false); err != nil {
			return err
		}
		if (mp.Split != "") != split {
			return invalid("%s: either every point has a split or none has", where)
		}
		if mp.Value, err = number(where+": the value", p.Value); err != nil {
			return err
		}
		if seen[[2]string{mp.Key, mp.Split}] {
			return invalid("%s: the same key (and split) appears twice", where)
		}
		seen[[2]string{mp.Key, mp.Split}] = true
		sum += mp.Value
		totals[mp.Split] += mp.Value
		out.Points = append(out.Points, mp)
	}
	if split {
		// Charts draw one series per entry here, so every split needs one:
		// the app's own names first, then any split it did not name.
		named := map[string]bool{}
		for i, s := range a.Series {
			where := "series " + strconv.Itoa(i+1)
			ms := db.MetricSeries{}
			var err error
			if ms.Key, err = text(where+": the key", s.Key, maxKey, true); err != nil {
				return err
			}
			if named[ms.Key] {
				return invalid("%s: the key appears twice", where)
			}
			named[ms.Key] = true
			if ms.Label, err = text(where+": the label", s.Label, maxLabel, false); err != nil {
				return err
			}
			if ms.Label == "" {
				ms.Label = ms.Key
			}
			if hexColor.MatchString(s.Color) {
				c := s.Color
				ms.Color = &c
			}
			ms.Total = totals[ms.Key]
			out.Series = append(out.Series, ms)
		}
		for _, p := range out.Points {
			if !named[p.Split] {
				named[p.Split] = true
				out.Series = append(out.Series, db.MetricSeries{Key: p.Split, Label: p.Split, Total: totals[p.Split]})
			}
		}
		if len(out.Series) > maxSeries {
			return invalid("the answer has more than %d series", maxSeries)
		}
	}
	out.Total = sum
	if a.Total != nil {
		t, err := number("the total", a.Total)
		if err != nil {
			return err
		}
		out.Total = t
	}
	return nil
}
