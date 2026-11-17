package db

import (
	"encoding/json"
)

// A chart widget's options (the widget's stored "options" object). Only the
// options this version knows are checked; any other key is kept and left
// alone, so a widget made by a newer Reskon survives a round trip through
// this one (and the phone, which ignores options it does not know).
//
//	color          one colour for a chart with no split: a palette name or #rrggbb
//	series_colors  {series key: #rrggbb}, a colour picked per series
//	show_values    true: write each value on its bar or line point

func checkChartOptions(raw json.RawMessage) error {
	var o map[string]json.RawMessage
	if err := json.Unmarshal(raw, &o); err != nil {
		return invalid("options must be a JSON object")
	}
	if v, ok := o["color"]; ok && !isNull(v) {
		var s string
		if json.Unmarshal(v, &s) != nil || len(s) > 40 {
			return invalid("options.color must be a colour name or #rrggbb")
		}
	}
	if v, ok := o["series_colors"]; ok && !isNull(v) {
		var m map[string]string
		if json.Unmarshal(v, &m) != nil {
			return invalid("options.series_colors must map each series to a #rrggbb colour")
		}
		for k, c := range m {
			if len(k) > 100 || !hexColor.MatchString(c) {
				return invalid("options.series_colors must map each series to a #rrggbb colour")
			}
		}
	}
	for _, k := range []string{"show_values"} {
		if v, ok := o[k]; ok && !isNull(v) {
			var b bool
			if json.Unmarshal(v, &b) != nil {
				return invalid("options.%s must be true or false", k)
			}
		}
	}
	return nil
}
