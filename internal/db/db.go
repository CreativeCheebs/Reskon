// Package db owns the SQLite file: opening it, migrating it, and every query.
// Queries are plain SQL; there is no ORM.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// DB is one user's database. Every query lives on a method of DB.
type DB struct {
	*sql.DB
}

// Open opens (creating if needed) one user's SQLite file, enables WAL and
// foreign keys, and applies any pending migrations.
func Open(path string) (*DB, error) {
	sqldb, err := OpenMigrated(path, migrationFS, "migrations")
	if err != nil {
		return nil, err
	}
	if err := installSyncTriggers(context.Background(), sqldb); err != nil {
		sqldb.Close()
		return nil, err
	}
	if err := customFieldIndexes(context.Background(), sqldb); err != nil {
		sqldb.Close()
		return nil, err
	}
	return &DB{sqldb}, nil
}

// OpenMigrated opens any Reskon SQLite file and applies the numbered
// migrations NNN_*.sql found in dir of fsys. The auth database uses it too.
func OpenMigrated(path string, fsys fs.FS, dir string) (*sql.DB, error) {
	// _txlock=immediate makes every transaction take the write lock up front,
	// so two concurrent "read max key, insert next" transactions serialise
	// instead of deadlocking or racing. temp_store(MEMORY) keeps SQLite's
	// scratch data in memory: Android has no temp folder SQLite can find,
	// and a big sort or transaction failed there with disk I/O error 6410.
	dsn := fmt.Sprintf("file:%s?_txlock=immediate"+
		"&_pragma=journal_mode(WAL)"+
		"&_pragma=foreign_keys(1)"+
		"&_pragma=busy_timeout(5000)"+
		"&_pragma=synchronous(NORMAL)"+
		"&_pragma=temp_store(MEMORY)", path)
	sqldb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// One writer connection per file keeps things obvious.
	sqldb.SetMaxOpenConns(1)
	if err := migrate(context.Background(), sqldb, fsys, dir); err != nil {
		sqldb.Close()
		return nil, fmt.Errorf("migrate %s: %w", path, err)
	}
	return sqldb, nil
}

// migrate applies dir/NNN_*.sql in order. The applied version is kept in
// PRAGMA user_version, so no bookkeeping table is needed. Running it again
// on an up-to-date database does nothing.
func migrate(ctx context.Context, d *sql.DB, fsys fs.FS, dir string) error {
	entries, err := fs.ReadDir(fsys, dir)
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
		body, err := fs.ReadFile(fsys, dir+"/"+name)
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

type ctxKey struct{}

// WithDB returns ctx carrying the signed-in user's database.
func WithDB(ctx context.Context, d *DB) context.Context {
	return context.WithValue(ctx, ctxKey{}, d)
}

// FromContext returns the database put there by WithDB, or nil.
func FromContext(ctx context.Context) *DB {
	d, _ := ctx.Value(ctxKey{}).(*DB)
	return d
}
