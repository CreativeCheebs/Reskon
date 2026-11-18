-- Migration 023: the Day Planner (owner decisions, 2026-11). Additive only.
--
-- A day has an ordered list of plan items. An item is either a task
-- (task_id) or an event (title, planned minutes, optional area). A task can
-- be planned on several days. Events are plan items, not tasks. An event is
-- complete when a session is linked to it (worked out when read, never
-- stored). Items are soft-deleted so the change syncs like any other.
--
-- AUTOINCREMENT, as for tags: rows sync, so an id must never be handed out
-- again.
CREATE TABLE day_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT NOT NULL,                     -- local date YYYY-MM-DD
  kind        TEXT NOT NULL CHECK (kind IN ('task','event')),
  task_id     INTEGER REFERENCES task(id),       -- kind 'task'
  title       TEXT,                              -- kind 'event'
  planned_min INTEGER,                           -- kind 'event': minutes reserved
  area_id     INTEGER REFERENCES area(id),       -- kind 'event': optional
  position    REAL NOT NULL DEFAULT 0,           -- order within the day
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX day_item_day ON day_item(day) WHERE deleted_at IS NULL;
CREATE INDEX day_item_task ON day_item(task_id) WHERE deleted_at IS NULL;

-- A session saved from a timer remembers when it ended, and the plan item
-- (an event, usually) it was logged against. started_at already exists.
ALTER TABLE session ADD COLUMN ended_at TEXT;
ALTER TABLE session ADD COLUMN day_item_id INTEGER REFERENCES day_item(id);
CREATE INDEX session_day_item ON session(day_item_id) WHERE day_item_id IS NOT NULL;

-- Available time for one day, in minutes, set by hand over the weekday
-- value in the planner_available setting. NULL = use the weekday's.
ALTER TABLE day_plan ADD COLUMN available_min INTEGER;

-- A running or paused timer, kept as wall-clock timestamps so it survives
-- closing the app or restarting the device. Elapsed time is worked out when
-- read: accumulated_s plus the time since resumed_at (NULL while paused).
-- More than one row can be running only when two devices each started one
-- while offline; the API says so. Stopping does NOT end the row: it sets
-- stopped_at and freezes the count, so the time survives until the session
-- draft is saved (the save retires the row) or discarded. Retiring
-- soft-deletes it. kind and title are kept so a timer on an event whose line
-- was later deleted still says what it was.
CREATE TABLE timer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           TEXT NOT NULL,
  day_item_id   INTEGER REFERENCES day_item(id),
  task_id       INTEGER REFERENCES task(id),
  kind          TEXT NOT NULL DEFAULT 'task',
  title         TEXT,
  started_at    TEXT NOT NULL,
  resumed_at    TEXT,
  stopped_at    TEXT,
  accumulated_s INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
