package auth

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func openAlice(t *testing.T) *Store {
	t.Helper()
	s, err := Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.Setup(context.Background(), "alice", "right password"); err != nil {
		t.Fatal(err)
	}
	return s
}

// Someone else typing the wrong password for "alice" from their own address
// must not stop Alice signing in from hers.
func TestLockoutIsPerUsernameAndClient(t *testing.T) {
	s := openAlice(t)
	attacker := WithClient(context.Background(), "203.0.113.9")
	alice := WithClient(context.Background(), "192.168.0.20")
	for i := 0; i < maxFailures; i++ {
		_, _, _ = s.Login(attacker, "alice", "wrong", "")
	}
	if _, _, err := s.Login(attacker, "alice", "right password", ""); !errors.Is(err, ErrLocked) {
		t.Fatalf("the attacker's address should be locked out, got %v", err)
	}
	if _, _, err := s.Login(alice, "alice", "right password", ""); err != nil {
		t.Fatalf("alice from another address was locked out: %v", err)
	}
}

// One address trying many different names is stopped as a whole.
func TestOneClientTryingManyNamesIsStopped(t *testing.T) {
	s := openAlice(t)
	spray := WithClient(context.Background(), "203.0.113.10")
	for i := 0; i < maxClientFailures; i++ {
		_, _, _ = s.Login(spray, fmt.Sprintf("name%d", i), "x", "")
	}
	if _, _, err := s.Login(spray, "alice", "right password", ""); !errors.Is(err, ErrLocked) {
		t.Fatalf("want ErrLocked for the spraying address, got %v", err)
	}
}

// Failures are remembered in memory; random names must not grow it forever.
func TestFailureMemoryIsBounded(t *testing.T) {
	s := openAlice(t)
	for i := 0; i < maxTracked*2; i++ {
		c := WithClient(context.Background(), fmt.Sprintf("10.%d.%d.%d", i>>16&255, i>>8&255, i&255))
		s.recordFailure(c, fmt.Sprintf("user%d", i))
	}
	s.mu.Lock()
	n := len(s.fails)
	s.mu.Unlock()
	if n > maxTracked {
		t.Fatalf("%d failure records kept, limit %d", n, maxTracked)
	}
}

// A stolen session must not be able to guess the current password forever.
func TestChangePasswordGuessingIsThrottled(t *testing.T) {
	s := openAlice(t)
	ctx := WithClient(context.Background(), "192.168.0.20")
	u, err := s.GetUser(ctx, 1) // alice, the first account
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxFailures; i++ {
		_ = s.ChangePassword(ctx, u.ID, "wrong", "a new password 1", "")
	}
	if err := s.ChangePassword(ctx, u.ID, "right password", "a new password 1", ""); !errors.Is(err, ErrLocked) {
		t.Fatalf("want ErrLocked after repeated wrong current passwords, got %v", err)
	}
}

func TestExpiredSessionsArePurged(t *testing.T) {
	s := openAlice(t)
	ctx := context.Background()
	_, token, err := s.Login(ctx, "alice", "right password", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.sql.ExecContext(ctx, `UPDATE login_session SET expires_at = ?`, "2000-01-01T00:00:00.000000000Z"); err != nil {
		t.Fatal(err)
	}
	if n, err := s.PurgeExpiredSessions(ctx, time.Now()); err != nil || n != 1 {
		t.Fatalf("purged %d (%v), want 1", n, err)
	}
	if _, err := s.SessionUser(ctx, token); !errors.Is(err, ErrNoSession) {
		t.Fatalf("an expired session still works: %v", err)
	}
}
