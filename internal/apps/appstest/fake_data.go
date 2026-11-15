package appstest

import (
	"net/http"
	"time"
)

// The pretend plugin's data widgets (docs/plugins.md section 6): "Today" (a
// checklist of today's habits, the same ticks as the page widget), "Done
// per day" (a ranged series, by day or week), "Streaks" (a table) and
// "Longest streak" (a number). Every feed needs the token Reskon signed in
// with. For tests there are two more calls, also with the token: one that
// switches every feed off (they answer 503) and on again, so a journey can
// see Reskon's kept copy, and one that ticks a habit without the page.

// dataWidgets are the data widgets in the description file.
func dataWidgets() []any {
	return []any{
		map[string]any{"id": "today_list", "title": "Today", "kind": "data", "shape": "checklist", "url": "/api/reskon/feeds/today", "size": map[string]any{"w": 4, "h": 5}},
		map[string]any{"id": "last_days", "title": "Done per day", "kind": "data", "shape": "series", "url": "/api/reskon/feeds/done-per-day", "ranged": true, "groups": []any{"day", "week"}, "size": map[string]any{"w": 6, "h": 4}},
		map[string]any{"id": "streaks", "title": "Streaks", "kind": "data", "shape": "table", "url": "/api/reskon/feeds/streaks", "size": map[string]any{"w": 6, "h": 4}},
		map[string]any{"id": "best_streak", "title": "Longest streak", "kind": "data", "shape": "number", "url": "/api/reskon/feeds/best-streak", "size": map[string]any{"w": 3, "h": 3}},
	}
}

const dayFmt = "2006-01-02"

// seedHistory makes up ticks for the 20 days before today, so the charts
// have something to show. Today starts with nothing ticked.
func (f *Fake) seedHistory() {
	today := f.Now()
	for d := 1; d <= 20; d++ {
		key := today.AddDate(0, 0, -d).Format(dayFmt)
		f.done[key] = map[string]bool{}
		for i, h := range Habits {
			if (d+i)%3 != 0 {
				f.done[key][h.Key] = true
			}
		}
	}
}

// countDone is how many habits were ticked on a day. Call with f.mu held.
func (f *Fake) countDone(d string) int {
	n := 0
	for _, h := range Habits {
		if f.done[d][h.Key] {
			n++
		}
	}
	return n
}

// streaks gives a habit's current run (ending today, or yesterday when
// today is not ticked yet) and its longest. Call with f.mu held.
func (f *Fake) streaks(key string) (current, longest int) {
	today := f.Now()
	run := 0
	for d := 400; d >= 0; d-- {
		if f.done[today.AddDate(0, 0, -d).Format(dayFmt)][key] {
			run++
			longest = max(longest, run)
		} else if d > 0 {
			run = 0
		}
	}
	current = run
	return current, longest
}

func (f *Fake) dataRoutes(mux *http.ServeMux) {
	// feed runs h with f.mu held, for Reskon's token, unless feeds are off.
	feed := func(h func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			f.mu.Lock()
			defer f.mu.Unlock()
			if bearer(r) != f.Token {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "secret detail that must not be shown"})
				return
			}
			if f.FeedsOff {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "secret detail that must not be shown"})
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("GET /api/reskon/feeds/today", feed(func(w http.ResponseWriter, r *http.Request) {
		items := []map[string]any{}
		for _, h := range Habits {
			items = append(items, map[string]any{"key": h.Key, "label": h.Label, "done": f.done[f.today()][h.Key]})
		}
		writeJSON(w, http.StatusOK, map[string]any{"shape": "checklist", "label": "Today", "items": items})
	}))
	mux.HandleFunc("GET /api/reskon/feeds/done-per-day", feed(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		to, err1 := time.Parse(dayFmt, q.Get("to"))
		from, err2 := time.Parse(dayFmt, q.Get("from"))
		if err1 != nil || err2 != nil || from.After(to) || to.Sub(from) > 400*24*time.Hour {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from and to must be days, at most 400 apart"})
			return
		}
		week := q.Get("group") == "week"
		points := []map[string]any{}
		index := map[string]int{}
		total := 0
		for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
			key := d
			if week {
				// Weeks start on Monday.
				key = d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
			}
			k := key.Format(dayFmt)
			n := f.countDone(d.Format(dayFmt))
			total += n
			if i, ok := index[k]; ok {
				points[i]["value"] = points[i]["value"].(int) + n
				continue
			}
			index[k] = len(points)
			points = append(points, map[string]any{"key": k, "label": key.Format("2 Jan"), "value": n})
		}
		writeJSON(w, http.StatusOK, map[string]any{"shape": "series", "unit": "count", "points": points, "total": total})
	}))
	mux.HandleFunc("GET /api/reskon/feeds/streaks", feed(func(w http.ResponseWriter, r *http.Request) {
		rows := []map[string]any{}
		for _, h := range Habits {
			cur, long := f.streaks(h.Key)
			rows = append(rows, map[string]any{"habit": h.Label, "current": cur, "longest": long})
		}
		writeJSON(w, http.StatusOK, map[string]any{"shape": "table",
			"columns": []map[string]any{{"key": "habit", "label": "Habit"}, {"key": "current", "label": "Now", "unit": "days"}, {"key": "longest", "label": "Longest", "unit": "days"}},
			"rows":    rows})
	}))
	mux.HandleFunc("GET /api/reskon/feeds/best-streak", feed(func(w http.ResponseWriter, r *http.Request) {
		best := 0
		for _, h := range Habits {
			_, long := f.streaks(h.Key)
			best = max(best, long)
		}
		writeJSON(w, http.StatusOK, map[string]any{"shape": "number", "label": "Longest streak", "unit": "days", "value": best})
	}))

	// Test switches, with the token (from a login): feeds off or on, and a
	// tick without the page.
	mux.HandleFunc("POST /api/test/feeds", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ On bool }
		ok := readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		if bearer(r) != f.Token || !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not signed in"})
			return
		}
		f.FeedsOff = !body.On
		writeJSON(w, http.StatusOK, map[string]bool{"on": body.On})
	})
	mux.HandleFunc("POST /api/test/tick/{key}", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Done bool }
		ok := readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		if bearer(r) != f.Token {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not signed in"})
			return
		}
		f.tick(w, r.PathValue("key"), body.Done, ok)
	})
}

// SetFeedsOff switches every feed off (they answer 503) or on again.
func (f *Fake) SetFeedsOff(off bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.FeedsOff = off
}

// Tick ticks (or unticks) one of today's habits, as the page would.
func (f *Fake) Tick(key string, done bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.done[f.today()] == nil {
		f.done[f.today()] = map[string]bool{}
	}
	f.done[f.today()][key] = done
}

// SetWidgetShape changes the shape the description file gives one of the
// data widgets (an app that changed what it sends).
func (f *Fake) SetWidgetShape(id, shape string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, w := range f.Manifest["widgets"].([]any) {
		if m := w.(map[string]any); m["id"] == id {
			m["shape"] = shape
		}
	}
}
