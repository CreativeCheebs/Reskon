-- Migration 006: Change 001, all energy types are equal. Additive only.
-- (Change 001 folds this into "migration 002"; 005 has already run on
-- existing databases, so it is a migration of its own. See
-- docs/deviations.md.)
--
-- energy_type.direction stays in the table and is no longer read.

-- Every type has a points rate. Points = hours x rate x difficulty.
ALTER TABLE energy_type ADD COLUMN points_per_hour REAL NOT NULL DEFAULT 1;

-- Sessions that earned nothing under the spend/restore split (Sleep,
-- Leisure, ...) get their points now, once. Points already stored are left
-- alone: they were stored at log time.
UPDATE session SET points = hours *
    (SELECT e.points_per_hour FROM energy_type e WHERE e.id = session.energy_type_id) *
    COALESCE(difficulty, (SELECT t.difficulty FROM task t WHERE t.id = session.task_id), 1)
  WHERE points IS NULL;

-- Drift needs to know which types count as work. It was the spend types;
-- now it is a setting, seeded from them. (Needs review, docs/deviations.md.)
INSERT OR IGNORE INTO setting (key, value)
  SELECT 'drift_energy_types', COALESCE(json_group_array(id), '[]')
  FROM (SELECT id FROM energy_type WHERE direction = 'spend' AND deleted_at IS NULL ORDER BY position, id);

-- The evening question is asked per energy type that had a ceiling:
-- {"<energy_type_id>": "about_right" | "too_high" | "too_low"}. A day's
-- old single answer is copied to each type it had a ceiling for; the old
-- ceiling_feedback column stays and is no longer read.
ALTER TABLE day_plan ADD COLUMN ceiling_feedbacks TEXT NOT NULL DEFAULT '{}';
UPDATE day_plan SET ceiling_feedbacks = COALESCE(
    (SELECT json_group_object(c.key, day_plan.ceiling_feedback) FROM json_each(day_plan.ceilings) c WHERE c.value > 0),
    '{}')
  WHERE ceiling_feedback IS NOT NULL;

-- Saved widget queries: work_points is now points, and the direction
-- filter no longer exists.
UPDATE widget SET query = json_set(query, '$.metric', 'points')
  WHERE json_extract(query, '$.metric') = 'work_points';
UPDATE widget SET query = json_remove(query, '$.filters.direction')
  WHERE json_extract(query, '$.filters.direction') IS NOT NULL;

-- ---------- default dashboards, as Change 001 lays them out ----------
-- Today = 1, This month = 2, The year = 3 (seeded by 005 with fixed ids).
-- The built-in dashboards' old widgets are soft-deleted (kept in the table)
-- and the new set is added. Widgets on dashboards you made are untouched.

UPDATE widget SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE deleted_at IS NULL AND dashboard_id IN (SELECT id FROM dashboard WHERE is_builtin = 1);

INSERT INTO widget (dashboard_id, title, viz, query, options, x, y, w, h, position)
  SELECT d.id, w.title, w.viz, w.query, '{}', w.x, w.y, w.w, w.h, w.position
  FROM dashboard d JOIN (
    SELECT 1 AS dash, 'Ceiling vs actual' AS title, 'bar' AS viz,
      '{"metric":"ceiling_vs_actual","group":"energy_type","range":"today"}' AS query, 0 AS x, 0 AS y, 6 AS w, 6 AS h, 0 AS position
    UNION ALL SELECT 1, 'Today''s sessions', 'table',
      '{"metric":"session_hours","group":"session","range":"today"}', 6, 0, 6, 6, 1
    UNION ALL SELECT 1, 'In force', 'list',
      '{"metric":"state_days","group":"name","range":"today"}', 0, 6, 4, 6, 2
    UNION ALL SELECT 1, 'Stuck work', 'table',
      '{"metric":"time_in_status","group":"task","range":"all"}', 4, 6, 8, 6, 3

    UNION ALL SELECT 2, 'All energy types — hours', 'small_multiples',
      '{"metric":"session_hours","group":"day","range":"30d","split":"energy_type"}', 0, 0, 12, 8, 0
    UNION ALL SELECT 2, 'Points per day by type', 'split_bar',
      '{"metric":"points","group":"day","range":"30d","split":"energy_type"}', 0, 8, 12, 6, 1
    UNION ALL SELECT 2, 'Conditions', 'bands',
      '{"metric":"state_days","group":"day","range":"30d"}', 0, 14, 12, 4, 2
    UNION ALL SELECT 2, 'Tasks closed', 'number',
      '{"metric":"tasks_closed","group":"day","range":"month"}', 0, 18, 4, 3, 3
    UNION ALL SELECT 2, 'Sessions logged', 'number',
      '{"metric":"session_count","group":"day","range":"month"}', 4, 18, 4, 3, 4
    UNION ALL SELECT 2, 'Days with something in the way', 'number',
      '{"metric":"state_days","group":"day","range":"month","filters":{"kind":"debuff"},"reduce":"nonzero"}', 8, 18, 4, 3, 5
    UNION ALL SELECT 2, 'Days over plan', 'list',
      '{"metric":"days_over_plan","group":"day","range":"month"}', 0, 21, 12, 6, 6

    UNION ALL SELECT 3, 'Points, cumulative', 'cumulative',
      '{"metric":"points","group":"day","range":"1y"}', 0, 0, 12, 6, 0
    UNION ALL SELECT 3, 'All energy types — points', 'small_multiples',
      '{"metric":"points","group":"week","range":"1y","split":"energy_type"}', 0, 6, 12, 8, 1
    UNION ALL SELECT 3, 'Tasks closed per week', 'bar',
      '{"metric":"tasks_closed","group":"week","range":"1y"}', 0, 14, 12, 6, 2
  ) w ON w.dash = d.id
  WHERE d.is_builtin = 1 AND d.deleted_at IS NULL;
