package capture

import "strings"

// Normalise checks a model's answer against the real lookups. Anything the
// model invented (an unknown energy type, area, subtype or task key, an
// impossible hours or difficulty) becomes nil, so the form shows a blank
// instead of a wrong value.
func Normalise(r Result, text string, l Lookups) Result {
	out := Result{Subtypes: []string{}}

	if r.Intent != nil && (*r.Intent == "session" || *r.Intent == "task") {
		out.Intent = r.Intent
	}
	if r.Kind != nil && (*r.Kind == "task" || *r.Kind == "event") {
		out.Kind = r.Kind
	}
	title := strings.TrimSpace(text)
	if r.Title != nil && strings.TrimSpace(*r.Title) != "" {
		title = strings.TrimSpace(*r.Title)
	}
	out.Title = &title

	out.EnergyType = pick(r.EnergyType, l.EnergyTypes)
	out.Area = pick(r.Area, l.Areas)

	if r.Hours != nil && *r.Hours > 0 && *r.Hours <= 24 {
		out.Hours = r.Hours
	}
	if r.Difficulty != nil {
		switch *r.Difficulty {
		case 1, 2, 3, 4, 5:
			out.Difficulty = r.Difficulty
		}
	}
	if r.Confidence != nil {
		c := *r.Confidence
		if c < 0 {
			c = 0
		}
		if c > 1 {
			c = 1
		}
		out.Confidence = &c
	}

	// Task matching: only a key from the SQLite candidates counts, and
	// events are never attached to a task by capture.
	isEvent := out.Kind != nil && *out.Kind == "event"
	if r.MatchedTaskKey != nil && !isEvent {
		for _, c := range l.Candidates {
			if strings.EqualFold(c.Key, strings.TrimSpace(*r.MatchedTaskKey)) {
				key, id := c.Key, c.ID
				out.MatchedTaskKey, out.MatchedTaskID = &key, &id
				// The task's energy type wins over whatever was parsed.
				if c.EnergyType != "" {
					et := c.EnergyType
					out.EnergyType = &et
				}
				break
			}
		}
	}

	// Subtypes must belong to the chosen energy type (any, if none chosen).
	allowed := map[string]string{} // lower -> canonical
	for et, names := range l.Subtypes {
		if out.EnergyType != nil && et != *out.EnergyType {
			continue
		}
		for _, n := range names {
			allowed[strings.ToLower(n)] = n
		}
	}
	seen := map[string]bool{}
	for _, s := range r.Subtypes {
		if n, ok := allowed[strings.ToLower(strings.TrimSpace(s))]; ok && !seen[n] && len(out.Subtypes) < 4 {
			seen[n] = true
			out.Subtypes = append(out.Subtypes, n)
		}
	}
	return out
}

// pick returns the canonical spelling of v from options, or nil.
func pick(v *string, options []string) *string {
	if v == nil {
		return nil
	}
	for _, o := range options {
		if strings.EqualFold(o, strings.TrimSpace(*v)) {
			o := o
			return &o
		}
	}
	return nil
}
