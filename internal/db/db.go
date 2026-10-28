// Package db owns the SQLite file: opening it, migrating it, and every query.
// Queries are plain SQL; there is no ORM.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// DB wraps the connection pool. Every query lives on a method of DB.
type DB struct {
	*sql.DB
}

// Open opens (creating if needed) the SQLite file at path, enables WAL and
// foreign keys, and applies any pending migrations.
func Open(path string) (*DB, error) {
	// _txlock=immediate makes every transaction take the write lock up front,
	// so two concurrent "read max key, insert next" transactions serialise
	// instead of deadlocking or racing.
	dsn := fmt.Sprintf("file:%s?_txlock=immediate"+
		"&_pragma=journal_mode(WAL)"+
		"&_pragma=foreign_keys(1)"+
		"&_pragma=busy_timeout(5000)"+
		"&_pragma=synchronous(NORMAL)", path)
	sqldb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// Single user, single file: one writer connection keeps things obvious.
	sqldb.SetMaxOpenConns(1)
	d := &DB{sqldb}
	if err := d.migrate(context.Background()); err != nil {
		sqldb.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

// migrate applies migrations/NNN_*.sql in order. The applied version is kept
// in PRAGMA user_version, so no bookkeeping table is needed. Running it again
// on an up-to-date database does nothing.
func (d *DB) migrate(ctx context.Context) error {
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	var current int
	if err := d.QueryRowContext(ctx, "PRAGMA user_version").Scan(&current); err != nil {
		return err
	}
	for _, name := range names {
		var version int
		if _, err := fmt.Sscanf(name, "%03d_", &version); err != nil {
			return fmt.Errorf("bad migration name %q", name)
		}
		if version <= current {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", name, err)
		}
		// PRAGMA does not take bound parameters; version is an int we parsed.
		if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", version)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Now returns the current UTC time as a fixed-width ISO-8601 string.
// Fixed width (always 9 fractional digits) means string order is time order,
// which the transition log and updated_at comparisons rely on.
func Now() string {
	return FormatTime(time.Now())
}

// FormatTime renders t in the one timestamp format the database uses.
func FormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

// ParseTime reads a timestamp written by FormatTime (or any RFC 3339 string).
func ParseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, s)
}

// placeholders returns "?,?,?" for n values.
func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}
