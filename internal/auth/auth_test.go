package auth

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"jitterbug/internal/db"
)

func TestLockoutAfterRepeatedFailures(t *testing.T) {
	s, err := Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	s.Setup(ctx, "alice", "right password")
	for i := 0; i < maxFailures; i++ {
		if _, _, err := s.Login(ctx, "alice", "wrong", ""); !errors.Is(err, ErrBadLogin) {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
	// Even the right password is refused while locked.
	if _, _, err := s.Login(ctx, "alice", "right password", ""); !errors.Is(err, ErrLocked) {
		t.Errorf("want ErrLocked, got %v", err)
	}
}

func TestFirstAdminAdoptsLegacyDatabase(t *testing.T) {
	dir := t.TempDir()
	legacy := filepath.Join(dir, "jitterbug.db")
	old, err := db.Open(legacy)
	if err != nil {
		t.Fatal(err)
	}
	old.Exec(`INSERT INTO area (name, key_prefix) VALUES ('Personal', 'PER')`)
	old.Close()

	s, err := Open(filepath.Join(dir, "data"), legacy)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	admin, err := s.Setup(ctx, "alice", "right password")
	if err != nil {
		t.Fatal(err)
	}
	d, _ := s.DBFor(ctx, admin.ID)
	areas, _ := d.ListAreas(ctx)
	if len(areas) != 1 || areas[0].Name != "Personal" {
		t.Errorf("admin did not get the legacy data: %+v", areas)
	}
	// A second user gets a fresh, empty database of their own.
	bob, err := s.CreateUser(ctx, "bob", "bobs password", false)
	if err != nil {
		t.Fatal(err)
	}
	bd, _ := s.DBFor(ctx, bob.ID)
	if areas, _ := bd.ListAreas(ctx); len(areas) != 0 {
		t.Errorf("bob sees %d areas", len(areas))
	}
	if _, err := os.Stat(filepath.Join(dir, "data", bob.dbFile)); err != nil {
		t.Errorf("bob's database file missing: %v", err)
	}
}

func TestDuplicateAndBadUsernames(t *testing.T) {
	s, _ := Open(t.TempDir(), "")
	defer s.Close()
	ctx := context.Background()
	s.Setup(ctx, "alice", "right password")
	if _, err := s.CreateUser(ctx, "ALICE", "another password", false); err == nil {
		t.Error("case-insensitive duplicate accepted")
	}
	if _, err := s.CreateUser(ctx, "a b", "another password", false); err == nil {
		t.Error("username with a space accepted")
	}
}

// A backup must copy the data as it is, without migrating it.
func TestBackupDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.Setup(context.Background(), "alice", "right password")
	if err != nil {
		t.Fatal(err)
	}
	d, _ := s.DBFor(context.Background(), u.ID)
	d.Exec(`PRAGMA user_version = 1`) // pretend it is an old database
	s.Close()

	dest := filepath.Join(dir, "bk")
	written, err := Backup(dir, dest)
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != 2 {
		t.Fatalf("written = %v", written)
	}
	check := func(path string) int {
		c, _ := sql.Open("sqlite", "file:"+path+"?mode=ro")
		defer c.Close()
		var v int
		c.QueryRow(`PRAGMA user_version`).Scan(&v)
		return v
	}
	if v := check(filepath.Join(dest, "alice.db")); v != 1 {
		t.Errorf("backup has version %d, want the original 1", v)
	}
	if v := check(filepath.Join(dir, "users", u.dbFile[len("users/"):])); v != 1 {
		t.Errorf("live database was migrated by the backup: version %d", v)
	}
	if _, err := Backup(dir, dest); err == nil {
		t.Error("backup overwrote an existing backup")
	}
}
