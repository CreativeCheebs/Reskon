-- Migration 001: the full Phase 1 schema, including tables with no Phase 1 UI.
-- After first run, only additive migrations (002, 003, ...) may follow.

-- ---------- lookups, all user-editable ----------

CREATE TABLE status_category (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  behaviour  TEXT NOT NULL CHECK (behaviour IN
               ('todo','in_progress','done','cancelled')),
  is_builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE status (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES status_category(id),
  color       TEXT,
  on_board    INTEGER NOT NULL DEFAULT 1,   -- 0 = reached by button, not a column
  alert_after_days INTEGER,                 -- NULL = never flag as stalled
  is_builtin  INTEGER NOT NULL DEFAULT 0,   -- builtin cannot be deleted
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT
);

CREATE TABLE priority (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT,
  weight     REAL NOT NULL DEFAULT 1.0,     -- multiplier in points
  position   INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

-- Engineering, Physical, Admin, Rest, Leisure ... extensible.
-- direction is what the no-netting rule keys off.
CREATE TABLE energy_type (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  direction  TEXT NOT NULL CHECK (direction IN ('spend','restore')),
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE subtype (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  energy_type_id INTEGER NOT NULL REFERENCES energy_type(id),
  position       INTEGER NOT NULL DEFAULT 0,
  deleted_at     TEXT,
  UNIQUE (energy_type_id, name)
);

CREATE TABLE area (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL UNIQUE,
  key_prefix             TEXT NOT NULL UNIQUE,   -- OM2, PER, FRL
  color                  TEXT,
  default_energy_type_id INTEGER REFERENCES energy_type(id),
  position               INTEGER NOT NULL DEFAULT 0,
  deleted_at             TEXT
);

-- ---------- core ----------

CREATE TABLE task (
  id             INTEGER PRIMARY KEY,
  key            TEXT NOT NULL UNIQUE,     -- PER-1; shown only in the task panel
  title          TEXT NOT NULL,
  description    TEXT,
  area_id        INTEGER NOT NULL REFERENCES area(id),
  status_id      INTEGER NOT NULL REFERENCES status(id),
  priority_id    INTEGER REFERENCES priority(id),
  energy_type_id INTEGER REFERENCES energy_type(id),  -- seeded from the area
  difficulty     INTEGER,                  -- 1,2,4,8,16
  estimate_h     REAL,
  due_at         TEXT,
  board_pos      REAL NOT NULL DEFAULT 0,  -- fractional, midpoint insertion
  custom         TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX task_board ON task(status_id, board_pos) WHERE deleted_at IS NULL;
CREATE INDEX task_area  ON task(area_id)              WHERE deleted_at IS NULL;

-- Append-only. Source of truth for every derived date.
CREATE TABLE status_transition (
  id             INTEGER PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES task(id),
  from_status_id INTEGER REFERENCES status(id),   -- NULL on creation
  to_status_id   INTEGER NOT NULL REFERENCES status(id),
  reason         TEXT,                            -- 'user' | 'status_deleted'
  at             TEXT NOT NULL
);
CREATE INDEX trans_task ON status_transition(task_id, at);

CREATE TABLE session (
  id             INTEGER PRIMARY KEY,
  task_id        INTEGER REFERENCES task(id),
  label          TEXT,                     -- used when task_id IS NULL
  area_id        INTEGER REFERENCES area(id),
  kind           TEXT NOT NULL CHECK (kind IN ('task','event')),
  energy_type_id INTEGER NOT NULL REFERENCES energy_type(id),
  hours          REAL NOT NULL,
  difficulty     INTEGER,
  started_at     TEXT,                      -- optional
  logged_for     TEXT NOT NULL,             -- local date YYYY-MM-DD
  note           TEXT,
  custom         TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX session_day ON session(logged_for) WHERE deleted_at IS NULL;

CREATE TABLE session_subtype (
  session_id INTEGER NOT NULL REFERENCES session(id),
  subtype_id INTEGER NOT NULL REFERENCES subtype(id),
  rank       INTEGER NOT NULL,              -- 1..4 -> 100/50/25/25 %
  PRIMARY KEY (session_id, rank)
);

-- ---------- no Phase 1 UI ----------

CREATE TABLE day_plan (
  day          TEXT PRIMARY KEY,
  focus        TEXT NOT NULL DEFAULT '[]',  -- JSON array of area names
  ceilings     TEXT NOT NULL DEFAULT '{}',  -- JSON {energy_type_id: number}
  locked_at    TEXT,
  note         TEXT
);

CREATE TABLE state (                        -- buffs, debuffs, modifiers
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('buff','debuff','modifier')),
  severity      REAL NOT NULL DEFAULT 1,    -- severity at day 0
  started_on    TEXT NOT NULL,
  duration_days INTEGER,                    -- NULL = open ended
  decay         TEXT NOT NULL DEFAULT 'static'
                  CHECK (decay IN ('static','linear','fast','slow')),
  cleared_on    TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX state_open ON state(cleared_on);

-- ---------- config ----------

CREATE TABLE view (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  layout      TEXT NOT NULL CHECK (layout IN ('board','table')),
  filter      TEXT NOT NULL DEFAULT '{}',
  card_config TEXT NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT
);

CREATE TABLE custom_field (
  id       INTEGER PRIMARY KEY,
  entity   TEXT NOT NULL CHECK (entity IN ('task','session')),
  key      TEXT NOT NULL,                   -- immutable once created
  label    TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN
             ('text','int','real','date','bool','select')),
  options  TEXT,                            -- JSON array, select only
  position INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  UNIQUE (entity, key)
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- JSON
);

-- ---------- seeds ----------

INSERT INTO status_category (id, name, behaviour, is_builtin) VALUES
  (1, 'To do',       'todo',        1),
  (2, 'In progress', 'in_progress', 1),
  (3, 'Done',        'done',        1),
  (4, 'Cancelled',   'cancelled',   1);

INSERT INTO status (id, name, category_id, color, on_board, is_builtin, position) VALUES
  (1, 'Backlog',     1, '#a1a1aa', 0, 1, 0),
  (2, 'To do',       1, '#a1a1aa', 1, 1, 1),
  (3, 'In progress', 2, '#60a5fa', 1, 1, 2),
  (4, 'Done',        3, '#4ade80', 1, 1, 3),
  (5, 'Cancelled',   4, '#71717a', 0, 1, 4);

INSERT INTO priority (id, name, color, weight, position, is_builtin) VALUES
  (1, 'Low',    '#a1a1aa', 0.75, 0, 1),
  (2, 'Normal', '#60a5fa', 1.0,  1, 1),
  (3, 'High',   '#fbbf24', 1.5,  2, 1);

INSERT INTO energy_type (id, name, direction, color, position) VALUES
  (1, 'Engineering', 'spend',   '#60a5fa', 0),
  (2, 'Physical',    'spend',   '#f97316', 1),
  (3, 'Admin',       'spend',   '#a78bfa', 2),
  (4, 'Rest',        'restore', '#34d399', 3),
  (5, 'Leisure',     'restore', '#2dd4bf', 4);

-- Subtypes ship empty; see docs/deviations.md (spec section 12 overrides the
-- section 3 seed list). Areas ship empty; first run asks for one.

INSERT INTO custom_field (entity, key, label, type, options, position) VALUES
  ('task',    'blocked_reason',    'Blocked reason',    'text',   NULL, 0),
  ('task',    'review_due',        'Review due',        'date',   NULL, 1),
  ('session', 'energy_drain_felt', 'Energy drain felt', 'select',
     '["lighter than expected","as expected","heavier"]', 0);

INSERT INTO view (name, layout, filter, card_config, position) VALUES
  ('Everything', 'table', '{"areas":null,"statuses":null,"difficulty_min":null,"custom":null,"include_done_days":7}', '{"show":{"area":true,"status":true}}', 1000),
  ('Stuck',      'table', '{"areas":null,"statuses":null,"difficulty_min":null,"custom":null,"include_done_days":0,"open_only":true}', '{"show":{"area":true,"status":true}}', 1001);

INSERT INTO setting (key, value) VALUES
  ('subtype_weights', '[1.0, 0.5, 0.25, 0.25]'),
  ('llm_endpoint',    '""'),
  ('llm_model',       '""');
