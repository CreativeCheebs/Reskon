package apps

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"jitterbug/internal/db"
)

// The cache of data widget answers (docs/decisions.md, "The cache: SQLite in
// a file, 10 MB per app, oldest out first"). Each answer is kept with its
// size and when it was last read; when one app's answers pass CacheLimit,
// the least recently read go first. Nothing expires by age. Removing the
// app removes its answers (a foreign key with ON DELETE CASCADE).

// CacheLimit is how many bytes of answers one app may keep for one person,
// and PersonCacheLimit how many all of one person's apps may keep together
// (so connecting many apps cannot fill the disk). Variables so tests can
// make them small.
var (
	CacheLimit       int64 = 10 << 20
	PersonCacheLimit int64 = 50 << 20
)

// incrementalVacuum makes the file give freed pages back to the disk
// (auto_vacuum = INCREMENTAL, and PRAGMA incremental_vacuum after
// deleting). SQLite only switches an existing file over with a VACUUM, and
// a VACUUM cannot run inside a transaction, so it is done here once, at
// open, not in a migration. The pool has one connection, so the PRAGMA and
// the VACUUM run on the same one.
func incrementalVacuum(ctx context.Context, d *sql.DB) error {
	var mode int
	if err := d.QueryRowContext(ctx, `PRAGMA auto_vacuum`).Scan(&mode); err != nil {
		return err
	}
	if mode == 2 {
		return nil
	}
	if _, err := d.ExecContext(ctx, `PRAGMA auto_vacuum = INCREMENTAL`); err != nil {
		return err
	}
	_, err := d.ExecContext(ctx, `VACUUM`)
	return err
}

// cacheGet reads a stored answer and marks it read just now. A copy in
// another shape than the widget has now (the app changed it) is no copy: it
// is dropped, so an old shape is never drawn.
func (s *Store) cacheGet(ctx context.Context, app int64, widget, params, shape string) (*DataResult, error) {
	var id int64
	var answer string
	err := s.sql.QueryRowContext(ctx, `SELECT id, answer FROM app_cache WHERE app = ? AND widget = ? AND params = ?`, app, widget, params).Scan(&id, &answer)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var res DataResult
	if json.Unmarshal([]byte(answer), &res) != nil || res.Shape != shape {
		_, err := s.sql.ExecContext(ctx, `DELETE FROM app_cache WHERE id = ?`, id)
		return nil, err
	}
	if _, err := s.sql.ExecContext(ctx, `UPDATE app_cache SET read_at = ? WHERE id = ?`, db.FormatTime(time.Now()), id); err != nil {
		return nil, err
	}
	return &res, nil
}

// cachePut stores an answer (replacing the one for the same parameters),
// then drops the least recently read answers until that app is within
// CacheLimit and all of the person's apps together within PersonCacheLimit.
// The answer just stored is never dropped.
func (s *Store) cachePut(ctx context.Context, app int64, widget, params string, res *DataResult) error {
	answer, err := json.Marshal(res)
	if err != nil {
		return err
	}
	tx, err := s.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id int64
	err = tx.QueryRowContext(ctx, `INSERT INTO app_cache (app, widget, params, answer, size, fetched_at, read_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (app, widget, params) DO UPDATE SET answer = excluded.answer, size = excluded.size,
			fetched_at = excluded.fetched_at, read_at = excluded.read_at
		RETURNING id`, app, widget, params, string(answer), len(answer), res.FetchedAt, db.FormatTime(time.Now())).Scan(&id)
	if err != nil {
		return err
	}
	// -1 means every app: the person's whole cache.
	byApp, err := trim(ctx, tx, app, id, CacheLimit)
	if err != nil {
		return err
	}
	all, err := trim(ctx, tx, -1, id, PersonCacheLimit)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if byApp || all {
		// The answer is stored; space not given back now is given back next time.
		_ = s.giveBack(ctx)
	}
	return nil
}

// trim drops the least recently read answers (of one app, or of all with
// app -1), never keep, until they total at most limit bytes. It says
// whether it dropped any.
func trim(ctx context.Context, tx *sql.Tx, app, keep, limit int64) (bool, error) {
	var total int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(size), 0) FROM app_cache WHERE ? = -1 OR app = ?`, app, app).Scan(&total); err != nil {
		return false, err
	}
	if total <= limit {
		return false, nil
	}
	var old []cachedSize
	rows, err := tx.QueryContext(ctx, `SELECT id, size FROM app_cache WHERE (? = -1 OR app = ?) AND id <> ? ORDER BY read_at, id`, app, app, keep)
	if err != nil {
		return false, err
	}
	for rows.Next() {
		var c cachedSize
		if err := rows.Scan(&c.id, &c.size); err != nil {
			rows.Close()
			return false, err
		}
		old = append(old, c)
	}
	rows.Close()
	dropped := false
	for _, c := range old {
		if total <= limit {
			break
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM app_cache WHERE id = ?`, c.id); err != nil {
			return false, err
		}
		total -= c.size
		dropped = true
	}
	return dropped, nil
}

type cachedSize struct{ id, size int64 }

// giveBack returns freed pages to the disk. Each step of the statement
// frees some pages, so its rows (if any) are read to the end.
func (s *Store) giveBack(ctx context.Context) error {
	rows, err := s.sql.QueryContext(ctx, `PRAGMA incremental_vacuum`)
	if err != nil {
		return err
	}
	for rows.Next() {
	}
	rows.Close()
	return rows.Err()
}

// CacheSize is how many bytes of answers an app keeps (tests and checks).
func (s *Store) CacheSize(ctx context.Context, app int64) (int64, error) {
	var total int64
	err := s.sql.QueryRowContext(ctx, `SELECT COALESCE(SUM(size), 0) FROM app_cache WHERE app = ?`, app).Scan(&total)
	return total, err
}
