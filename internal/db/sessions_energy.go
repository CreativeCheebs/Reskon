package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
)

// A session's energy types (migration 009). A session with one type has no
// session_energy rows and stands for itself. A session with two or more has
// one row per type: each takes a share of the session's hours (the shares
// add up to 1, so no hour is counted twice), has its own intensity (stored
// as difficulty) and its own points, stored when logged. The session's own
// energy_type_id and difficulty are then the first part's, and its points
// the sum of the parts'.

// MaxSessionEnergies caps how many energy types one session can have.
const MaxSessionEnergies = 4

// SessionEnergy is one energy type of a session, as returned by the API.
// Every session has at least one; a one-type session's is its own type at
// share 1.
type SessionEnergy struct {
	EnergyTypeID int64    `json:"energy_type_id"`
	Share        float64  `json:"share"`      // part of the session's hours, 0..1
	Difficulty   *int64   `json:"difficulty"` // this part's intensity
	Points       *float64 `json:"points"`     // stored when logged
	Hours        float64  `json:"hours"`      // derived: session hours x share
}

// SQL for reading sessions part by part: join the parts, and take the
// session itself (share 1) when it has none.
const (
	sessionPartsJoin = `LEFT JOIN session_energy p ON p.session_id = s.id`
	partEnergy       = `COALESCE(p.energy_type_id, s.energy_type_id)`
	partShare        = `COALESCE(p.share, 1)`
	partPointsCol    = `CASE WHEN p.session_id IS NULL THEN COALESCE(s.points, 0) ELSE COALESCE(p.points, 0) END`
)

type energyPart struct {
	EnergyTypeID int64   `json:"energy_type_id"`
	Share        float64 `json:"share"`
	Difficulty   *int64  `json:"difficulty"`
}

// parseEnergies reads and removes the "energies" field. When present it
// also sets energy_type_id and difficulty in f to the first part's, so a
// one-part list is the same as sending those two fields.
func parseEnergies(f Fields) (parts []energyPart, present bool, err error) {
	raw, ok := f["energies"]
	delete(f, "energies")
	if !ok || isNull(raw) {
		return nil, false, nil
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return nil, true, invalid("energies must be a list of {energy_type_id, share, difficulty}")
	}
	if len(parts) == 0 {
		return nil, false, nil
	}
	if len(parts) > MaxSessionEnergies {
		return nil, true, invalid("at most %d energy types in one session", MaxSessionEnergies)
	}
	seen := map[int64]bool{}
	sum := 0.0
	for _, p := range parts {
		if seen[p.EnergyTypeID] {
			return nil, true, invalid("energy type %d listed twice", p.EnergyTypeID)
		}
		seen[p.EnergyTypeID] = true
		if p.Share <= 0 || p.Share > 1 {
			return nil, true, invalid("each energy type's share must be more than 0 and at most 1")
		}
		if p.Difficulty != nil && !validDifficulty(*p.Difficulty) {
			return nil, true, invalid("intensity must be a whole number from 1 to 5")
		}
		sum += p.Share
	}
	if math.Abs(sum-1) > 0.001 {
		return nil, true, invalid("the energy types' shares must add up to 100%% (they add up to %.0f%%)", sum*100)
	}
	if len(parts) == 1 {
		parts[0].Share = 1
	}
	f["energy_type_id"], _ = json.Marshal(parts[0].EnergyTypeID)
	f["difficulty"], _ = json.Marshal(parts[0].Difficulty)
	return parts, true, nil
}

// partPoints is what each part earns when it is logged: hours x share x its
// type's rate x intensity (the part's, else the task's, else 1), the same
// formula as a one-type session. With total set (points sent by hand, or
// kept on an edit), the parts are scaled to add up to it.
func partPoints(ctx context.Context, q querier, parts []energyPart, hours float64, taskID *int64, total *float64) ([]float64, error) {
	out := make([]float64, len(parts))
	sum := 0.0
	for i, p := range parts {
		v, err := storedPoints(ctx, q, p.EnergyTypeID, hours*p.Share, p.Difficulty, taskID)
		if err != nil {
			return nil, err
		}
		out[i] = *v
		sum += *v
	}
	if total != nil {
		for i, p := range parts {
			if sum > 0 {
				out[i] = *total * out[i] / sum
			} else {
				out[i] = *total * p.Share
			}
		}
	}
	return out, nil
}

// writeEnergies replaces a session's parts. Fewer than two parts means a
// one-type session, which has no rows. points nil stores no points.
func writeEnergies(ctx context.Context, tx *sql.Tx, sessionID int64, parts []energyPart, points []float64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM session_energy WHERE session_id = ?`, sessionID); err != nil {
		return err
	}
	if len(parts) < 2 {
		return nil
	}
	for i, p := range parts {
		var pts *float64
		if points != nil {
			pts = &points[i]
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO session_energy (session_id, energy_type_id, share, difficulty, points, position)
			VALUES (?, ?, ?, ?, ?, ?)`, sessionID, p.EnergyTypeID, p.Share, p.Difficulty, pts, i); err != nil {
			return uniqueAsConflict(err, "bad energy type")
		}
	}
	return nil
}

// rescaleEnergyPoints keeps a session's parts adding up to its points after
// the points were edited by hand.
func rescaleEnergyPoints(ctx context.Context, tx *sql.Tx, sessionID int64, total *float64) error {
	if total == nil {
		_, err := tx.ExecContext(ctx, `UPDATE session_energy SET points = NULL WHERE session_id = ?`, sessionID)
		return err
	}
	var sum sql.NullFloat64
	if err := tx.QueryRowContext(ctx, `SELECT SUM(points) FROM session_energy WHERE session_id = ?`, sessionID).Scan(&sum); err != nil {
		return err
	}
	if sum.Valid && sum.Float64 > 0 {
		_, err := tx.ExecContext(ctx, `UPDATE session_energy SET points = points * ? / ? WHERE session_id = ?`, *total, sum.Float64, sessionID)
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE session_energy SET points = share * ? WHERE session_id = ?`, *total, sessionID)
	return err
}

// attachEnergies fills Energies and PointsNow on each session.
func (d *DB) attachEnergies(ctx context.Context, sessions []*Session) error {
	if err := loadEnergies(ctx, d, sessions); err != nil {
		return err
	}
	return pointsNow(ctx, d, sessions)
}

// loadEnergies fills Energies on each session: its parts when it has them,
// else its own type at share 1. Part hours are derived here.
func loadEnergies(ctx context.Context, q querier, sessions []*Session) error {
	if len(sessions) == 0 {
		return nil
	}
	byID := map[int64]*Session{}
	ids := make([]any, len(sessions))
	for i, s := range sessions {
		s.Energies = []SessionEnergy{{EnergyTypeID: s.EnergyTypeID, Share: 1, Difficulty: s.Difficulty, Points: s.Points, Hours: s.Hours}}
		byID[s.ID] = s
		ids[i] = s.ID
	}
	seen := map[int64]bool{}
	return scanInto(ctx, q, fmt.Sprintf(`SELECT session_id, energy_type_id, share, difficulty, points FROM session_energy
		WHERE session_id IN (%s) ORDER BY session_id, position`, placeholders(len(ids))), func(r *sql.Rows) error {
		var sid int64
		var e SessionEnergy
		if err := r.Scan(&sid, &e.EnergyTypeID, &e.Share, &e.Difficulty, &e.Points); err != nil {
			return err
		}
		s := byID[sid]
		if !seen[sid] {
			seen[sid] = true
			s.Energies = s.Energies[:0]
		}
		e.Hours = s.Hours * e.Share
		s.Energies = append(s.Energies, e)
		return nil
	}, ids...)
}

// pointsNow sets PointsNow: what each session would earn now, at today's
// rates, from its stored hours, energy types and intensities. The client
// compares it with Points to offer a recalculation after a rate change.
func pointsNow(ctx context.Context, q querier, sessions []*Session) error {
	if len(sessions) == 0 {
		return nil
	}
	rates := map[int64]float64{}
	if err := scanInto(ctx, q, `SELECT id, points_per_hour FROM energy_type`, func(r *sql.Rows) error {
		var id int64
		var rate float64
		err := r.Scan(&id, &rate)
		rates[id] = rate
		return err
	}); err != nil {
		return err
	}
	var taskIDs []any
	for _, s := range sessions {
		if s.TaskID != nil {
			taskIDs = append(taskIDs, *s.TaskID)
		}
	}
	taskDiff := map[int64]*int64{}
	if len(taskIDs) > 0 {
		if err := scanInto(ctx, q, fmt.Sprintf(`SELECT id, difficulty FROM task WHERE id IN (%s)`, placeholders(len(taskIDs))), func(r *sql.Rows) error {
			var id int64
			var diff *int64
			err := r.Scan(&id, &diff)
			taskDiff[id] = diff
			return err
		}, taskIDs...); err != nil {
			return err
		}
	}
	for _, s := range sessions {
		var td *int64
		if s.TaskID != nil {
			td = taskDiff[*s.TaskID]
		}
		total := 0.0
		for _, e := range s.Energies {
			total += *sessionPoints(rates[e.EnergyTypeID], s.Hours*e.Share, e.Difficulty, td)
		}
		s.PointsNow = &total
	}
	return nil
}

// takeRecalculate reads and removes the "recalculate" flag.
func takeRecalculate(f Fields) bool {
	raw, ok := f["recalculate"]
	delete(f, "recalculate")
	var b bool
	return ok && json.Unmarshal(raw, &b) == nil && b
}

// nextParts is what a session's parts become under a patch that sends
// energy_type_id or difficulty without a list of energies: one type set on
// its own makes it a one-type session; an intensity on its own applies to
// every part.
func nextParts(cur *Session, f Fields, typeSet, diffSet bool) []energyPart {
	next := make([]energyPart, len(cur.Energies))
	for i, e := range cur.Energies {
		next[i] = energyPart{EnergyTypeID: e.EnergyTypeID, Share: e.Share, Difficulty: e.Difficulty}
	}
	var diff *int64
	if diffSet {
		if n, ok, _ := f.int64Field("difficulty"); ok {
			diff = &n
		}
		for i := range next {
			next[i].Difficulty = diff
		}
	}
	if typeSet {
		if n, ok, _ := f.int64Field("energy_type_id"); ok {
			first := next[0]
			first.EnergyTypeID, first.Share = n, 1
			next = []energyPart{first}
		}
	}
	return next
}

// partsDiffer reports whether a session's energy types, shares or
// intensities would change.
func partsDiffer(cur []SessionEnergy, next []energyPart) bool {
	if len(cur) != len(next) {
		return true
	}
	for i, n := range next {
		c := cur[i]
		if c.EnergyTypeID != n.EnergyTypeID || math.Abs(c.Share-n.Share) > 0.0005 || !sameInt(c.Difficulty, n.Difficulty) {
			return true
		}
	}
	return false
}

func sameInt(a, b *int64) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}

func hoursChanged(cur *Session, f Fields) bool {
	raw, ok := f["hours"]
	if !ok {
		return false
	}
	var h float64
	return json.Unmarshal(raw, &h) == nil && math.Abs(h-cur.Hours) > 1e-9
}

func taskChanged(cur *Session, f Fields) bool {
	if _, ok := f["task_id"]; !ok {
		return false
	}
	n, ok, _ := f.int64Field("task_id")
	if !ok {
		return cur.TaskID != nil
	}
	return cur.TaskID == nil || *cur.TaskID != n
}

// recalcPoints stores a session's points afresh at today's rates, part by
// part when it has several energy types.
func recalcPoints(ctx context.Context, tx *sql.Tx, id int64) error {
	s, err := scanSession(tx.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM session WHERE id = ?`, id))
	if err != nil {
		return err
	}
	if err := loadEnergies(ctx, tx, []*Session{s}); err != nil {
		return err
	}
	if len(s.Energies) < 2 {
		p, err := storedPoints(ctx, tx, s.EnergyTypeID, s.Hours, s.Difficulty, s.TaskID)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE session SET points = ? WHERE id = ?`, *p, id)
		return err
	}
	parts := make([]energyPart, len(s.Energies))
	for i, e := range s.Energies {
		parts[i] = energyPart{EnergyTypeID: e.EnergyTypeID, Share: e.Share, Difficulty: e.Difficulty}
	}
	pts, err := partPoints(ctx, tx, parts, s.Hours, s.TaskID, nil)
	if err != nil {
		return err
	}
	sum := 0.0
	for i, p := range parts {
		sum += pts[i]
		if _, err := tx.ExecContext(ctx, `UPDATE session_energy SET points = ? WHERE session_id = ? AND energy_type_id = ?`,
			pts[i], id, p.EnergyTypeID); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE session SET points = ? WHERE id = ?`, sum, id)
	return err
}
