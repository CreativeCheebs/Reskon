-- Migration 020: the Home dashboard (2026-11-16). Additive only.
--
-- A new dashboard shown before the others, for everyone, new and existing:
-- your open tasks as a small board, yesterday's hours and points, and the
-- last 7 days of both. Dashboards you already have are not touched.
--
-- Sync: every device gets the same Home from this migration, so it has the
-- same fixed uids everywhere (like the built-in dashboards in 016, but
-- named for the dashboard, since ids differ between devices). Each insert
-- is skipped when its uid already exists: an older phone may already have
-- been sent Home by the server before it upgrades.
--
-- Triggers: on a database that has been opened before, the sync triggers
-- are still in place and give each new row a random uid and a "changed"
-- mark. The fixed uid replaces the random one. The marks are KEPT, so Home
-- and its widgets travel through normal sync, and any mark that was there
-- before (an unpushed edit to Home made on a phone that had been sent it)
-- is never touched. Because the uids are fixed, another device's Home
-- updates the same rows instead of adding a second one; where the devices
-- chose differently (the board's view), the last writer wins.

-- Before every other dashboard, without moving them. Ordered by position,
-- then id, and every other dashboard's position is 0 or more.
INSERT INTO dashboard (name, position, is_builtin)
  SELECT 'Home', -1, 1
  WHERE NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'dashboard', last_insert_rowid(), 'b-dashboard-home' WHERE changes() > 0;

-- The board: open tasks from a saved view. Which view: the first board
-- view by position, else the first view of any kind (a new account has
-- only the table view "Everything" until its first area makes a board
-- view; the widget draws the same open columns whatever the view's
-- layout). Chosen by layout and position, never by name. With no view at
-- all there is no board, and the rest of Home still works.
INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT (SELECT id FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'),
         'Open tasks', 'view', 'board', json_object('view_id', v.id), '{}', 0, 0, 8, 8, 0
  FROM view v
  WHERE v.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-board')
  ORDER BY CASE v.layout WHEN 'board' THEN 0 ELSE 1 END, v.position, v.id
  LIMIT 1;
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-board' WHERE changes() > 0;

-- Numbers use group "day" so the widget shows one total, not a figure per type.
INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT (SELECT id FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'),
         'Hours yesterday', 'metric', 'number',
         '{"metric":"session_hours","group":"day","range":"yesterday"}', '{}', 8, 0, 4, 4, 1
  WHERE NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-hours-yesterday');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-hours-yesterday' WHERE changes() > 0;

INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT (SELECT id FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'),
         'Points yesterday', 'metric', 'number',
         '{"metric":"points","group":"day","range":"yesterday"}', '{}', 8, 4, 4, 4, 2
  WHERE NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-points-yesterday');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-points-yesterday' WHERE changes() > 0;

INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT (SELECT id FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'),
         'Points, last 7 days', 'metric', 'bar',
         '{"metric":"points","group":"day","range":"7d"}', '{}', 0, 8, 6, 6, 3
  WHERE NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-points-7d');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-points-7d' WHERE changes() > 0;

INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT (SELECT id FROM sync_idmap WHERE tbl = 'dashboard' AND uid = 'b-dashboard-home'),
         'Hours, last 7 days', 'metric', 'bar',
         '{"metric":"session_hours","group":"day","range":"7d"}', '{}', 6, 8, 6, 6, 4
  WHERE NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-hours-7d');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-hours-7d' WHERE changes() > 0;
