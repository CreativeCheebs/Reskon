package api

import (
	"net/http"

	"jitterbug/internal/db"
)

func (s *Server) taskRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/tasks", s.listTasks)
	m.HandleFunc("POST /api/tasks", s.createTask)
	m.HandleFunc("GET /api/tasks/{id}", s.getTask)
	m.HandleFunc("PATCH /api/tasks/{id}", s.patchTask)
	m.HandleFunc("DELETE /api/tasks/{id}", s.deleteTask)
	m.HandleFunc("POST /api/tasks/{id}/move", s.moveTask)
	m.HandleFunc("POST /api/tasks/move", s.moveTasks)
	m.HandleFunc("POST /api/tasks/{id}/snooze", s.snoozeTask)
	m.HandleFunc("GET /api/tasks/{id}/transitions", s.taskTransitions)
	m.HandleFunc("GET /api/cycle-time", s.cycleTime)
}

func (s *Server) moveTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var req db.MoveRequest
	if err := decodeBody(r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	t, renumbered, err := dbOf(r.Context()).MoveReporting(r.Context(), id, req)
	if err != nil {
		respond(w, nil, err)
		return
	}
	// The task, plus column_renumbered when the other cards in the column
	// were given new positions and the board must reload them.
	respond(w, struct {
		*db.Task
		ColumnRenumbered bool `json:"column_renumbered,omitempty"`
	}{t, renumbered}, nil)
}

// moveTasks moves several tasks to one status at once, from the table's
// selection. Each goes to the end of its new column.
func (s *Server) moveTasks(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TaskIDs  []int64 `json:"task_ids"`
		StatusID int64   `json:"status_id"`
		Today    string  `json:"today"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	ts, err := dbOf(r.Context()).MoveMany(r.Context(), body.TaskIDs, body.StatusID, body.Today)
	respond(w, ts, err)
}

// snoozeTask hides an open task for {days} days from {today}; days 0 wakes it.
func (s *Server) snoozeTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var body struct {
		Days  int    `json:"days"`
		Today string `json:"today"`
	}
	if err := decodeBody(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).Snooze(r.Context(), id, body.Days, body.Today)
	respond(w, t, err)
}

func (s *Server) taskTransitions(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if _, err := dbOf(r.Context()).GetTask(r.Context(), id); err != nil {
		respond(w, nil, err)
		return
	}
	tr, segs, err := dbOf(r.Context()).TaskCycle(r.Context(), id)
	respond(w, map[string]any{"transitions": tr, "segments": segs}, err)
}

// cycleTime is the stacked cycle-time chart for every task in a view.
func (s *Server) cycleTime(w http.ResponseWriter, r *http.Request) {
	viewID, ok, err := queryID(r, "view")
	if err == nil && !ok {
		err = &db.InvalidError{Msg: "view is required"}
	}
	if err != nil {
		respond(w, nil, err)
		return
	}
	ct, err := dbOf(r.Context()).CycleTimeForView(r.Context(), viewID)
	respond(w, ct, err)
}

// listTasks resolves the view's filter server-side; the client sends only
// the view id, plus an optional ?q= search. Without ?view= it returns every
// task, with ?type=epic every epic (for pickers), with ?epic=:id the
// tasks in one epic (for its panel), or with ?parent=:id a task's subtasks.
func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	viewID, ok, err := queryID(r, "view")
	if err != nil {
		respond(w, nil, err)
		return
	}
	if ok {
		tasks, err := dbOf(r.Context()).ListTasksForView(r.Context(), viewID, r.URL.Query().Get("q"))
		respond(w, tasks, err)
		return
	}
	epicID, ok, err := queryID(r, "epic")
	if err != nil {
		respond(w, nil, err)
		return
	}
	if ok {
		tasks, err := dbOf(r.Context()).ListEpicTasks(r.Context(), epicID)
		respond(w, tasks, err)
		return
	}
	parentID, ok, err := queryID(r, "parent")
	if err != nil {
		respond(w, nil, err)
		return
	}
	if ok {
		tasks, err := dbOf(r.Context()).ListSubtasks(r.Context(), parentID)
		respond(w, tasks, err)
		return
	}
	if r.URL.Query().Get("brief") == "1" {
		tasks, err := dbOf(r.Context()).ListTaskBriefs(r.Context())
		respond(w, tasks, err)
		return
	}
	if t := r.URL.Query().Get("type"); t != "" {
		tasks, err := dbOf(r.Context()).ListTasksOfType(r.Context(), t)
		respond(w, tasks, err)
		return
	}
	tasks, err := dbOf(r.Context()).ListTasks(r.Context())
	respond(w, tasks, err)
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).CreateTask(r.Context(), f)
	respond(w, t, err)
}

func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).GetTask(r.Context(), id)
	respond(w, t, err)
}

func (s *Server) patchTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	f, err := decodeFields(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	t, err := dbOf(r.Context()).PatchTask(r.Context(), id, f)
	respond(w, t, err)
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, map[string]bool{"ok": true}, dbOf(r.Context()).DeleteTask(r.Context(), id))
}
