-- Migration 021: repair widgets that arrived before this device knew their
-- kind (2026-11-16). Changes rows only, no tables or columns.
--
-- How it happens: a phone with a newer Reskon syncs a Board, App page, App
-- data or Journal widget to a server that has not been upgraded yet. That
-- server has no `source` column, so it keeps the widget without its kind;
-- when it is upgraded, migration 019 gives it the default kind, "metric",
-- and the widget shows an error. A Board widget also keeps the phone's
-- sync id for its view (a text), because the old server could not
-- translate it. (Seen on the live server when Home reached it from a
-- phone before the server was upgraded.)
--
-- The kind is read back from what only that kind can have: the chart type
-- or the query's keys. Metric widgets never have these, so they are not
-- touched. The sync triggers mark the repaired rows, so they travel on.

UPDATE widget SET source = 'view'
 WHERE source = 'metric' AND viz = 'board'
   AND json_valid(query) AND json_type(query, '$.view_id') IS NOT NULL;

UPDATE widget SET source = 'journal'
 WHERE source = 'metric' AND viz = 'journal';

UPDATE widget SET source = 'app_page'
 WHERE source = 'metric' AND viz = 'page'
   AND json_valid(query) AND json_type(query, '$.app') = 'text';

UPDATE widget SET source = 'app_data'
 WHERE source = 'metric' AND viz <> 'page'
   AND json_valid(query) AND json_type(query, '$.app') = 'text'
   AND json_type(query, '$.widget') = 'text';

-- A Board widget's view given as a sync id: this device's own id for it.
-- One with no mapping here is left as it is (the widget says its view is
-- gone, and it can be pointed at another).
UPDATE widget
   SET query = json_set(query, '$.view_id',
         (SELECT m.id FROM sync_idmap m
           WHERE m.tbl = 'view' AND m.uid = json_extract(widget.query, '$.view_id')))
 WHERE source = 'view'
   AND json_type(query, '$.view_id') = 'text'
   AND EXISTS (SELECT 1 FROM sync_idmap m
                WHERE m.tbl = 'view' AND m.uid = json_extract(widget.query, '$.view_id'));
