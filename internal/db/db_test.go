package db

import (
	"path/filepath"
	"testing"
)

// openTest opens a fresh database in a temp directory.
func openTest(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func count(t *testing.T, d *DB, table string) int {
	t.Helper()
	var n int
	if err := d.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestMigrationSeedsAndIdempotence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int{
		"status_category": 4,
		"status":          5,
		"priority":        3,
		"energy_type":     5,
		"subtype":         0,
		"area":            0,
		"custom_field":    3,
		"view":            2,
	}
	for table, n := range want {
		if got := count(t, d, table); got != n {
			t.Errorf("%s: got %d rows, want %d", table, got, n)
		}
	}
	d.Close()

	// Reopening must not re-run the migration or duplicate seeds.
	d, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if got := count(t, d, "status"); got != 5 {
		t.Errorf("after reopen: status has %d rows, want 5", got)
	}
	var mode string
	d.QueryRow("PRAGMA journal_mode").Scan(&mode)
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want wal", mode)
	}
}
