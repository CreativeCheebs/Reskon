-- Migration 007: running totals per energy type, and each type's share of
-- a day, week or month. Additive only; built-in dashboards only.
-- Today = 1, This month = 2, The year = 3 (seeded by 005 with fixed ids).

-- The year: the single "Points, cumulative" chart is replaced by one
-- running total per energy type (points and hours). The old widget is
-- soft-deleted (kept in the table); the rest move down to make room.
UPDATE widget SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE deleted_at IS NULL AND viz = 'cumulative'
    AND json_extract(query, '$.metric') = 'points' AND json_extract(query, '$.split') IS NULL
    AND dashboard_id IN (SELECT id FROM dashboard WHERE id = 3 AND is_builtin = 1);

UPDATE widget SET y = y + 16, position = position + 2
  WHERE deleted_at IS NULL AND dashboard_id IN (SELECT id FROM dashboard WHERE id = 3 AND is_builtin = 1);

INSERT INTO widget (dashboard_id, title, viz, query, options, x, y, w, h, position)
  SELECT d.id, w.title, w.viz, w.query, '{}', w.x, w.y, w.w, w.h, w.position
  FROM dashboard d JOIN (
    SELECT 3 AS dash, 'All energy types — points, cumulative' AS title, 'small_multiples' AS viz,
      '{"metric":"points","group":"day","range":"1y","split":"energy_type","cumulative":true}' AS query, 0 AS x, 0 AS y, 12 AS w, 8 AS h, 0 AS position
    UNION ALL SELECT 3, 'All energy types — hours, cumulative', 'small_multiples',
      '{"metric":"session_hours","group":"day","range":"1y","split":"energy_type","cumulative":true}', 0, 8, 12, 8, 1
    UNION ALL SELECT 3, 'Share of each week by type — hours', 'share_bar',
      '{"metric":"session_hours","group":"week","range":"1y","split":"energy_type"}', 0, 100, 12, 7, 100

    UNION ALL SELECT 1, 'Today by type — hours', 'pie',
      '{"metric":"session_hours","group":"energy_type","range":"today"}', 0, 100, 6, 7, 100
    UNION ALL SELECT 1, 'Today by type — points', 'pie',
      '{"metric":"points","group":"energy_type","range":"today"}', 6, 100, 6, 7, 101

    UNION ALL SELECT 2, 'Share of each day by type — hours', 'share_bar',
      '{"metric":"session_hours","group":"day","range":"30d","split":"energy_type"}', 0, 100, 12, 7, 100
    UNION ALL SELECT 2, 'Share of each day by type — points', 'share_bar',
      '{"metric":"points","group":"day","range":"30d","split":"energy_type"}', 0, 107, 12, 7, 101
    UNION ALL SELECT 2, 'This month by type — hours', 'pie',
      '{"metric":"session_hours","group":"energy_type","range":"month"}', 0, 114, 6, 7, 102
    UNION ALL SELECT 2, 'This month by type — points', 'pie',
      '{"metric":"points","group":"energy_type","range":"month"}', 6, 114, 6, 7, 103
  ) w ON w.dash = d.id
  WHERE d.is_builtin = 1 AND d.deleted_at IS NULL;
