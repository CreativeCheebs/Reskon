package api

import (
	"net/http"
	"strings"
)

// Timers (see internal/db/timers.go).

func (s *Server) listTimers(w http.ResponseWriter, r *http.Request) {
	v, err := dbOf(r.Context()).ListTimers(r.Context())
	respond(w, v, err)
}

// startTimer: {"day": "YYYY-MM-DD", "task_id": n} or {"day": ..., "day_item_id": n}.
// 409 {error, detail, current: {timers, conflict}} while another timer is running.
func (s *Server) startTimer(w http.ResponseWriter, r *http.Request) {
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	v, err := dbOf(r.Context()).StartTimer(r.Context(), f)
	respond(w, v, err)
}

// timerAction serves pause, resume and stop (the last word of the path).
// Pause and resume return the timer; stop returns {timer_id, draft} and keeps the timer, stopped, until the draft is saved or the timer discarded.
func (s *Server) timerAction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	d := dbOf(r.Context())
	switch {
	case strings.HasSuffix(r.URL.Path, "/pause"):
		v, err := d.PauseTimer(r.Context(), id)
		respond(w, v, err)
	case strings.HasSuffix(r.URL.Path, "/resume"):
		v, err := d.ResumeTimer(r.Context(), id)
		respond(w, v, err)
	default:
		v, err := d.StopTimer(r.Context(), id)
		respond(w, v, err)
	}
}

// discardTimer throws a timer away, running, paused or stopped (it is how a
// stopped timer's draft is cancelled; saving the draft retires the timer itself).
func (s *Server) discardTimer(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DiscardTimer(r.Context(), id))
}
