-- Migration 016: sync (Change 003). Additive only.
--
-- sync_idmap gives every synced row a uid, the id every device agrees on.
-- Local integer ids stay and still drive the API. setting and day_plan
-- have natural keys (key, day) and need no uid.
--
-- sync_field holds, per row and field, when it last changed: a hybrid
-- logical clock, the device that changed it, and seq, a local counter
-- that says what changed since a sync token. It keeps only the latest
-- change of each field, so it never grows past the data itself (Change
-- 003 item 19's trimming comes free). Field '_row' stands for every field
-- of a new row; '_deleted' is a tombstone. The triggers that fill it are
-- made by the Go code (internal/db/sync_triggers.go) from one table list.

CREATE TABLE sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO sync_meta (key, value) VALUES
  ('device',   lower(hex(randomblob(8)))),  -- this database's device id
  ('clock',    '0'),                         -- last clock handed out, ms
  ('seq',      '0'),                         -- last seq handed out
  ('applying', '0'),                         -- 1 while remote changes are applied: triggers stay quiet
  ('pushed',   '0'),                         -- device: last local seq the server has
  ('token',    '0'),                         -- device: the server's seq it has seen
  ('server',   '');                          -- device: the sync server's address, if any

CREATE TABLE sync_idmap (
  tbl TEXT    NOT NULL,
  id  INTEGER NOT NULL,
  uid TEXT    NOT NULL,
  PRIMARY KEY (tbl, id),
  UNIQUE (tbl, uid)
);

CREATE TABLE sync_field (
  tbl    TEXT    NOT NULL,
  key    TEXT    NOT NULL,  -- local id, or the natural key
  field  TEXT    NOT NULL,
  clock  INTEGER NOT NULL,
  device TEXT    NOT NULL,
  seq    INTEGER NOT NULL,
  PRIMARY KEY (tbl, key, field)
);
CREATE INDEX sync_field_seq ON sync_field (seq);

-- Built-in rows get the same uid on every device, so every device's
-- "Backlog" is one record. They were all seeded with known ids by the
-- migration that made their table.
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'status_category', id, 'b-status_category-' || id FROM status_category WHERE id <= 4;
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'status', id, 'b-status-' || id FROM status WHERE id <= 5;
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'priority', id, 'b-priority-' || id FROM priority WHERE id <= 3;
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'energy_type', id, 'b-energy_type-' || id FROM energy_type WHERE id <= 5;
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'view', id, 'b-view-' || id FROM view WHERE id <= 2;
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'dashboard', id, 'b-dashboard-' || id FROM dashboard WHERE id <= 3;
-- Widgets of the built-in dashboards were added by three migrations, so
-- their ids differ between databases; dashboard and title identify them.
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', id, 'b-widget-' || dashboard_id || '-' || title FROM widget WHERE dashboard_id <= 3;
-- A custom field's entity and key never change, so they are its uid.
INSERT INTO sync_idmap (tbl, id, uid)
  SELECT 'custom_field', id, 'cf-' || entity || '-' || key FROM custom_field;

-- Every other existing row: a random uid.
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'status_category', id, lower(hex(randomblob(16))) FROM status_category;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'status', id, lower(hex(randomblob(16))) FROM status;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'priority', id, lower(hex(randomblob(16))) FROM priority;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'energy_type', id, lower(hex(randomblob(16))) FROM energy_type;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'subtype', id, lower(hex(randomblob(16))) FROM subtype;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'area', id, lower(hex(randomblob(16))) FROM area;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'view', id, lower(hex(randomblob(16))) FROM view;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'dashboard', id, lower(hex(randomblob(16))) FROM dashboard;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'widget', id, lower(hex(randomblob(16))) FROM widget;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'task', id, lower(hex(randomblob(16))) FROM task;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'task_link', id, lower(hex(randomblob(16))) FROM task_link;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'status_transition', id, lower(hex(randomblob(16))) FROM status_transition;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'session', id, lower(hex(randomblob(16))) FROM session;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'state', id, lower(hex(randomblob(16))) FROM state;
INSERT OR IGNORE INTO sync_idmap (tbl, id, uid) SELECT 'inbox_item', id, lower(hex(randomblob(16))) FROM inbox_item;
