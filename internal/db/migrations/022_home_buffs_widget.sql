-- Migration 022: the Buffs and debuffs widget on Home (2026-11-18). Additive
-- only: it adds one widget row; no table or column changes.
--
-- Every Home dashboard (new accounts get it here too, because Home is made
-- by 020 and this runs right after) gets a small "Buffs and debuffs" widget
-- at the top, full width, 2 rows high. A Home that is deleted is left
-- alone. A Home that already has a widget of this kind (one you added
-- yourself, or one a phone already sent) is left alone as well.
--
-- Moving others: the new widget takes the top two rows, so every other
-- widget on Home moves down two rows (same column, same size, same order).
-- Nothing is resized, removed or changed otherwise.
--
-- Sync: like 020, the widget has a fixed uid, so every device that runs this
-- migration ends up with the same one widget, and a device that was already
-- sent it (a phone upgraded first) is not given a second. The sync triggers,
-- where they are in place, mark the new row and the moved rows as changed
-- so they travel to the other devices; the marks are kept, never cleared.

-- Move the existing widgets down first (the conditions are the same as for
-- the insert below and are still true, because nothing has been inserted).
UPDATE widget SET y = y + 2
 WHERE deleted_at IS NULL
   AND dashboard_id = (SELECT d.id FROM sync_idmap m JOIN dashboard d ON d.id = m.id
                        WHERE m.tbl = 'dashboard' AND m.uid = 'b-dashboard-home' AND d.deleted_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM widget s WHERE s.dashboard_id = widget.dashboard_id AND s.source = 'states' AND s.deleted_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-buffs');

INSERT INTO widget (dashboard_id, title, source, viz, query, options, x, y, w, h, position)
  SELECT d.id, 'Buffs and debuffs', 'states', 'states', '{}', '{}', 0, 0, 12, 2, -1
  FROM sync_idmap m JOIN dashboard d ON d.id = m.id
  WHERE m.tbl = 'dashboard' AND m.uid = 'b-dashboard-home' AND d.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM widget s WHERE s.dashboard_id = d.id AND s.source = 'states' AND s.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'widget' AND uid = 'b-widget-home-buffs');
INSERT OR REPLACE INTO sync_idmap (tbl, id, uid)
  SELECT 'widget', last_insert_rowid(), 'b-widget-home-buffs' WHERE changes() > 0;
