package db

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// Deleting an energy type that is in use is refused until a target is
// given; then everything moves, and a session that had both types gets
// one part with the two shares and points added.
func TestDeleteEnergyTypeMovesEverything(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a := mustArea(t, d, "Home", "HM")
	tk := mustTask(t, d, a.ID, "Fix the shed")
	if _, err := d.PatchTask(ctx, tk.ID, fields(t, fmt.Sprintf(`{"energy_type_id":3,"updated_at":%q}`, tk.UpdatedAt))); err != nil {
		t.Fatal(err)
	}
	s, err := d.CreateSession(ctx, fields(t, `{"hours":2,"energy_type_id":1,"difficulty":2,"logged_for":"2026-11-04",
		"energies":[{"energy_type_id":1,"share":0.6,"difficulty":2},{"energy_type_id":3,"share":0.4,"difficulty":3}]}`))
	if err != nil {
		t.Fatal(err)
	}

	var c *ConflictError
	if err := d.DeleteEnergyType(ctx, 3, nil); !errors.As(err, &c) {
		t.Fatalf("want a conflict listing what uses it, got %v", err)
	}
	to := int64(1)
	if err := d.DeleteEnergyType(ctx, 3, &to); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetTask(ctx, tk.ID)
	if err != nil || got.EnergyTypeID == nil || *got.EnergyTypeID != 1 {
		t.Fatalf("task not moved: %v %v", got.EnergyTypeID, err)
	}
	var parts int
	var share float64
	d.QueryRowContext(ctx, `SELECT COUNT(*), SUM(share) FROM session_energy WHERE session_id = ?`, s.ID).Scan(&parts, &share)
	if parts != 1 || share < 0.999 || share > 1.001 {
		t.Fatalf("session parts: %d with share %v, want 1 part with share 1", parts, share)
	}
}

func TestDeleteAreaMovesTasks(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	a, b := mustArea(t, d, "Home", "HM"), mustArea(t, d, "Work", "WK")
	tk := mustTask(t, d, a.ID, "Paint the door")
	if err := d.DeleteArea(ctx, a.ID, nil); err == nil {
		t.Fatal("an area with tasks was deleted without asking where they go")
	}
	if err := d.DeleteArea(ctx, a.ID, &b.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetTask(ctx, tk.ID)
	if got.AreaID != b.ID || got.Key != "HM-1" {
		t.Fatalf("task: area %d key %s, want area %d and the key kept", got.AreaID, got.Key, b.ID)
	}
}

// A session logged with one energy type has no parts rows, and an area can
// name a default type. Both count as "in use": deleting the type must ask
// where they go, not leave them pointing at a deleted row.
func TestDeleteEnergyTypeCountsOneTypeSessionsAndAreaDefaults(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	s, err := d.CreateSession(ctx, fields(t, `{"hours":1,"energy_type_id":3,"difficulty":2,"logged_for":"2026-11-04"}`))
	if err != nil {
		t.Fatal(err)
	}
	var c *ConflictError
	if err := d.DeleteEnergyType(ctx, 3, nil); !errors.As(err, &c) {
		t.Fatalf("a type used by a one-type session was deleted without a target: %v", err)
	}
	to := int64(1)
	if err := d.DeleteEnergyType(ctx, 3, &to); err != nil {
		t.Fatal(err)
	}
	var et int64
	if err := d.QueryRowContext(ctx, `SELECT energy_type_id FROM session WHERE id = ?`, s.ID).Scan(&et); err != nil || et != 1 {
		t.Fatalf("session type = %d (%v), want 1", et, err)
	}

	a := mustArea(t, d, "Home", "HM")
	if _, err := d.ExecContext(ctx, `UPDATE area SET default_energy_type_id = 2 WHERE id = ?`, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteEnergyType(ctx, 2, nil); !errors.As(err, &c) {
		t.Fatalf("a type that is an area's default was deleted without a target: %v", err)
	}
}
