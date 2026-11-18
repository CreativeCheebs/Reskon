package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// The triggers that record changes for sync are made here from syncTables
// and the live column list, and replaced on every open, so a migration that
// adds a column needs no trigger work. Every write is caught wherever it
// comes from: the web app, the phone, db.Move, bulk edits, the Jira import.

const syncQuiet = `(SELECT value FROM sync_meta WHERE key = 'applying') = '0'`

// syncBump hands out the next seq and clock: the clock is the later of
// one past the last one and now in ms, so it only ever goes forward.
const syncBump = `
  UPDATE sync_meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'seq';
  UPDATE sync_meta SET value = max(CAST(value AS INTEGER) + 1,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)) WHERE key = 'clock';`

// syncMark records that field of the row keyed by keySQL changed now, here.
func syncMark(tbl, keySQL, field, cond string) string {
	return fmt.Sprintf(`
  INSERT INTO sync_field (tbl, key, field, clock, device, seq)
    SELECT '%s', CAST(%s AS TEXT), '%s',
      (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'),
      (SELECT value FROM sync_meta WHERE key = 'device'),
      (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'seq')
    WHERE %s
    ON CONFLICT (tbl, key, field) DO UPDATE SET clock = excluded.clock, device = excluded.device, seq = excluded.seq;`,
		tbl, keySQL, field, cond)
}

func tableColumns(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}, table string) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// syncTriggerSQL is every trigger for one table.
func syncTriggerSQL(t *syncTable, cols []string) []string {
	n := t.name
	var out []string
	if t.parent != "" {
		// A child row changing is a change to its session's field.
		for _, ev := range []struct{ name, row string }{{"INSERT", "NEW"}, {"UPDATE", "NEW"}, {"DELETE", "OLD"}} {
			out = append(out, fmt.Sprintf("CREATE TRIGGER sync_%s_%s AFTER %s ON %s WHEN %s BEGIN%s%s\nEND",
				n, strings.ToLower(ev.name), ev.name, n, syncQuiet, syncBump,
				syncMark("session", ev.row+".session_id", t.parent, "1")))
		}
		return out
	}
	key := "NEW.id"
	oldKey := "OLD.id"
	if t.natural != "" {
		key, oldKey = "NEW."+t.natural, "OLD."+t.natural
	} else {
		uid := t.uidSQL
		if uid == "" {
			uid = "lower(hex(randomblob(16)))"
		}
		// The uid is made even while applying; the applier then sets the
		// remote one in its place.
		out = append(out, fmt.Sprintf(
			"CREATE TRIGGER sync_%s_uid AFTER INSERT ON %s BEGIN\n  INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) VALUES ('%s', NEW.id, %s);\nEND",
			n, n, n, uid))
	}
	out = append(out, fmt.Sprintf("CREATE TRIGGER sync_%s_insert AFTER INSERT ON %s WHEN %s BEGIN%s%s\nEND",
		n, n, syncQuiet, syncBump, syncMark(n, key, "_row", "1")))

	var marks strings.Builder
	for _, c := range cols {
		if c == "id" || c == t.natural || t.skips(c) {
			continue
		}
		marks.WriteString(syncMark(n, key, c, fmt.Sprintf("NEW.%s IS NOT OLD.%s", c, c)))
	}
	out = append(out, fmt.Sprintf("CREATE TRIGGER sync_%s_update AFTER UPDATE ON %s WHEN %s BEGIN%s%s\nEND",
		n, n, syncQuiet, syncBump, marks.String()))
	out = append(out, fmt.Sprintf("CREATE TRIGGER sync_%s_delete AFTER DELETE ON %s WHEN %s BEGIN%s%s\nEND",
		n, n, syncQuiet, syncBump, syncMark(n, oldKey, "_deleted", "1")))
	return out
}

// installSyncTriggers replaces the sync triggers of every synced table.
func installSyncTriggers(ctx context.Context, d *sql.DB) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\_%' ESCAPE '\'`)
	if err != nil {
		return err
	}
	var old []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		old = append(old, name)
	}
	rows.Close()
	for _, name := range old {
		if _, err := tx.ExecContext(ctx, `DROP TRIGGER `+name); err != nil {
			return err
		}
	}
	for i := range syncTables {
		t := &syncTables[i]
		cols, err := tableColumns(ctx, tx, t.name)
		if err != nil {
			return err
		}
		if len(cols) == 0 {
			continue // a table a migration has not made yet (a database held at an older version)
		}
		for _, stmt := range syncTriggerSQL(t, cols) {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return fmt.Errorf("sync trigger on %s: %w", t.name, err)
			}
		}
	}
	return tx.Commit()
}
