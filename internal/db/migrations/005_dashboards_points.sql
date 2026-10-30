-- Migration 005: Phase 2 dashboards, stored session points, ceiling
-- feedback. Additive only. (The Phase 2 spec calls this "migration 002";
-- 002-004 were already taken, see docs/deviations.md.)

CREATE TABLE dashboard (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE widget (
  id           INTEGER PRIMARY KEY,
  dashboard_id INTEGER NOT NULL REFERENCES dashboard(id),
  title        TEXT,
  viz          TEXT NOT NULL,          -- bar, line, cumulative, number,
                                       -- list, bands, split_bar, table
  query        TEXT NOT NULL DEFAULT '{}',  -- JSON: metric, group, range, filters, split
  options      TEXT NOT NULL DEFAULT '{}',  -- JSON, per-viz display
  x            INTEGER NOT NULL DEFAULT 0,
  y            INTEGER NOT NULL DEFAULT 0,
  w            INTEGER NOT NULL DEFAULT 4,
  h            INTEGER NOT NULL DEFAULT 4,
  position     INTEGER NOT NULL DEFAULT 0,  -- mobile stack order
  deleted_at   TEXT
);
CREATE INDEX widget_dash ON widget(dashboard_id) WHERE deleted_at IS NULL;

-- Points are stored when a session is logged, so changing the formula never
-- rewrites history. hours x difficulty (the session's, else its task's,
-- else 1); restore sessions earn none. Backfilled once, here.
ALTER TABLE session ADD COLUMN points REAL;
UPDATE session SET points = hours * COALESCE(difficulty,
    (SELECT t.difficulty FROM task t WHERE t.id = session.task_id), 1)
  WHERE energy_type_id IN (SELECT id FROM energy_type WHERE direction = 'spend');

-- The evening question: was today's ceiling about right? Answering it never
-- closes the day. Drives the next days' suggested ceilings.
ALTER TABLE day_plan ADD COLUMN ceiling_feedback TEXT
  CHECK (ceiling_feedback IN ('about_right', 'too_high', 'too_low'));

-- week_start: ISO weekday a week begins on, 1 = Monday ... 7 = Sunday.
-- drift_low_hours: a day with less spend than this counts as low-work for
-- the Drift widget.
INSERT OR IGNORE INTO setting (key, value) VALUES
  ('week_start', '1'),
  ('drift_low_hours', '1');

-- ---------- default dashboards ----------

INSERT INTO dashboard (id, name, position, is_builtin) VALUES
  (1, 'Today',      0, 1),
  (2, 'This month', 1, 1),
  (3, 'The year',   2, 1);

INSERT INTO widget (dashboard_id, title, viz, query, options, x, y, w, h, position) VALUES
  (1, 'Ceiling vs actual', 'bar',
     '{"metric":"ceiling_vs_actual","group":"energy_type","range":"today"}', '{}', 0, 0, 6, 6, 0),
  (1, 'Today''s work', 'table',
     '{"metric":"session_hours","group":"session","range":"today","filters":{"direction":"spend"}}', '{}', 6, 0, 6, 6, 1),
  (1, 'In force', 'list',
     '{"metric":"state_days","group":"name","range":"today"}', '{}', 0, 6, 4, 6, 2),
  (1, 'Stuck work', 'table',
     '{"metric":"time_in_status","group":"task","range":"all"}', '{}', 4, 6, 8, 6, 3),

  (2, 'Conditions', 'bands',
     '{"metric":"state_days","group":"day","range":"30d"}', '{}', 0, 0, 12, 3, 0),
  (2, 'Work points per day', 'bar',
     '{"metric":"work_points","group":"day","range":"30d"}', '{}', 0, 3, 12, 6, 1),
  (2, 'Tasks closed', 'number',
     '{"metric":"tasks_closed","group":"day","range":"month"}', '{}', 0, 9, 3, 3, 2),
  (2, 'Sessions logged', 'number',
     '{"metric":"session_count","group":"day","range":"month"}', '{}', 3, 9, 3, 3, 3),
  (2, 'Rest hours', 'number',
     '{"metric":"session_hours","group":"day","range":"month","filters":{"direction":"restore"}}', '{}', 6, 9, 3, 3, 4),
  (2, 'Days with something in the way', 'number',
     '{"metric":"state_days","group":"day","range":"month","filters":{"kind":"debuff"},"reduce":"nonzero"}', '{}', 9, 9, 3, 3, 5),
  (2, 'Days over plan', 'list',
     '{"metric":"days_over_plan","group":"day","range":"month"}', '{}', 0, 12, 6, 6, 6),
  (2, 'Hours by subtype', 'split_bar',
     '{"metric":"session_hours","group":"week","range":"month","split":"subtype","filters":{"direction":"spend"}}', '{}', 6, 12, 6, 6, 7),

  (3, 'Work points, cumulative', 'cumulative',
     '{"metric":"work_points","group":"day","range":"1y"}', '{}', 0, 0, 12, 6, 0),
  (3, 'Tasks closed per week', 'bar',
     '{"metric":"tasks_closed","group":"week","range":"1y"}', '{}', 0, 6, 6, 6, 1),
  (3, 'Rest hours per month', 'bar',
     '{"metric":"session_hours","group":"month","range":"1y","filters":{"direction":"restore"}}', '{}', 6, 6, 6, 6, 2);
