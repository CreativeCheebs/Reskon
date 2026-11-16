package auth

import (
	"context"
	"errors"
	"testing"
)

func TestAppHooks(t *testing.T) {
	ctx := context.Background()
	s, err := Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	admin, err := s.Setup(ctx, "alice", "first password")
	if err != nil {
		t.Fatal(err)
	}
	bob, err := s.CreateUser(ctx, "bob", "bobs password", false)
	if err != nil {
		t.Fatal(err)
	}
	key := func() string {
		k, err := NewHookKey()
		if err != nil || !ValidHookKey(k) {
			t.Fatalf("key %q %v", k, err)
		}
		return k
	}
	if ValidHookKey("short") || ValidHookKey(key()+"x") || ValidHookKey("+"+key()[1:]) {
		t.Error("a key of another shape counts as valid")
	}

	k1 := key()
	if err := s.SetAppHook(ctx, bob.ID, "habits", k1); err != nil {
		t.Fatal(err)
	}
	if u, app, err := s.AppHookOwner(ctx, HookHash(k1)); err != nil || u != bob.ID || app != "habits" {
		t.Fatalf("owner = %d %q %v", u, app, err)
	}
	// Only the hash is stored.
	var n int
	if err := s.sql.QueryRow(`SELECT COUNT(*) FROM app_hook WHERE key_hash = ?`, k1).Scan(&n); err != nil || n != 0 {
		t.Fatalf("the key itself is stored: %d %v", n, err)
	}

	// A new key replaces the old one; other people's keys are their own.
	k2, ka := key(), key()
	_ = s.SetAppHook(ctx, bob.ID, "habits", k2)
	_ = s.SetAppHook(ctx, admin.ID, "habits", ka)
	if _, _, err := s.AppHookOwner(ctx, HookHash(k1)); !errors.Is(err, ErrNoHook) {
		t.Errorf("old key still works: %v", err)
	}
	if u, _, _ := s.AppHookOwner(ctx, HookHash(ka)); u != admin.ID {
		t.Errorf("alice's key = user %d", u)
	}

	// A disabled account's keys do nothing, and work again when enabled.
	if err := s.SetDisabled(ctx, bob.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.AppHookOwner(ctx, HookHash(k2)); !errors.Is(err, ErrNoHook) {
		t.Errorf("disabled account's key works: %v", err)
	}
	_ = s.SetDisabled(ctx, bob.ID, false)

	if err := s.DropAppHook(ctx, bob.ID, "habits"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.AppHookOwner(ctx, HookHash(k2)); !errors.Is(err, ErrNoHook) {
		t.Errorf("dropped key works: %v", err)
	}
	if u, _, _ := s.AppHookOwner(ctx, HookHash(ka)); u != admin.ID {
		t.Errorf("dropping bob's key dropped alice's")
	}
}
