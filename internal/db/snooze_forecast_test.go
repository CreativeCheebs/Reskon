package db

import (
	"context"
	"fmt"
	"testing"
)

func forecastTask(t *testing.T, d *DB, areaID int64, extra string) *Task {
	t.Helper()
	tk, err := d.CreateTask(context.Background(), fields(t, fmt.Sprintf(`{"title":"t","area_id":%d%s}`, areaID, extra)))
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

func TestSnoozeForecast(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Personal", "PER")
	if _, err := d.ExecContext(ctx, `UPDATE energy_type SET points_per_hour = 3 WHERE id = 1`); err != nil {
		t.Fatal(err)
	}
	snooze := func(tk *Task, today string, days int) {
		t.Helper()
		if _, err := d.Snooze(ctx, tk.ID, days, false, today); err != nil {
			t.Fatal(err)
		}
	}

	// 2h x rate 3 x difficulty 4 x High (1.5) = 36 points, on 18 Nov.
	full := forecastTask(t, d, a.ID, `,"estimate_h":2,"energy_type_id":1,"difficulty":4,"priority_id":3`)
	snooze(full, "2026-11-17", 1)
	// Only an estimate: no difficulty and no priority count as 1; the area gives
	// it energy type 1 (rate 3). 1.5h x 3 = 4.5 points.
	bare := forecastTask(t, d, a.ID, `,"estimate_h":1.5`)
	snooze(bare, "2026-11-17", 1)
	// Another day; a year edge (the date is the text, not a time conversion).
	newYear := forecastTask(t, d, a.ID, `,"estimate_h":1,"energy_type_id":1`)
	snooze(newYear, "2026-12-31", 1)
	// No estimate adds nothing; a zero one neither.
	snooze(forecastTask(t, d, a.ID, ``), "2026-11-17", 1)
	snooze(forecastTask(t, d, a.ID, `,"estimate_h":0`), "2026-11-17", 1)
	// Done, cancelled and deleted tasks are left out.
	for _, status := range []int64{4, 5} {
		fin := forecastTask(t, d, a.ID, `,"estimate_h":5`)
		snooze(fin, "2026-11-17", 1)
		if _, err := d.Move(ctx, fin.ID, MoveRequest{StatusID: status, Today: "2026-11-17"}); err != nil {
			t.Fatal(err)
		}
		// A finished task has its snooze cleared; put one back to prove the
		// forecast looks at the status too.
		if _, err := d.ExecContext(ctx, `UPDATE task SET snoozed_until = '2026-11-18' WHERE id = ?`, fin.ID); err != nil {
			t.Fatal(err)
		}
	}
	gone := forecastTask(t, d, a.ID, `,"estimate_h":7`)
	snooze(gone, "2026-11-17", 1)
	if err := d.DeleteTask(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	// Snoozed until unblocked has no date.
	asked := []string{"2026-11-17", "2026-11-18", "2026-11-19", "2027-01-01", "2026-12-31"}

	got, err := d.SnoozeForecast(ctx, asked, 0)
	if err != nil {
		t.Fatal(err)
	}
	want := []SnoozeDay{
		{"2026-11-17", 0, 0},
		{"2026-11-18", 3.5, 36 + 4.5},
		{"2026-11-19", 0, 0},
		{"2027-01-01", 1, 3},
		{"2026-12-31", 0, 0},
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("day %d = %+v, want %+v", i, got[i], want[i])
		}
	}

	// The same formulas the app uses elsewhere.
	four, high := int64(4), 1.5
	if p := *sessionPoints(3, 2, nil, &four) * *taskPoints(&four, &high) / float64(four); p != 36 {
		t.Errorf("formula cross-check = %v", p)
	}

	// The task being snoozed is not counted.
	got, _ = d.SnoozeForecast(ctx, []string{"2026-11-18"}, full.ID)
	if got[0].Hours != 1.5 || got[0].Points != 4.5 {
		t.Errorf("excluding the task: %+v", got[0])
	}

	// Asked twice, answered twice; none asked, none answered.
	got, _ = d.SnoozeForecast(ctx, []string{"2026-11-18", "2026-11-18"}, 0)
	if len(got) != 2 || got[0] != got[1] || got[1].Hours != 3.5 {
		t.Errorf("duplicate dates: %+v", got)
	}
	if got, err := d.SnoozeForecast(ctx, nil, 0); err != nil || len(got) != 0 {
		t.Errorf("no dates: %+v %v", got, err)
	}
	if _, err := d.SnoozeForecast(ctx, []string{"tomorrow"}, 0); err == nil {
		t.Error("a bad date was accepted")
	}
	if _, err := d.SnoozeForecast(ctx, make([]string, MaxForecastDates+1), 0); err == nil {
		t.Error("too many dates were accepted")
	}
}
