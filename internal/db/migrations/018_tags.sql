-- Migration 018: tags (owner request, 2026-11-13). Additive only.
--
-- A tag is a short free word on a task ("backend", "q4") that sits beside
-- the area and the epic. A task can have several. A session shows the tags
-- of its task as they are now (worked out when read, never stored), plus any
-- tags put on the session by hand: only those are kept here.
--
-- Names are unique ignoring capitals ("Backend" and "backend" are one tag).
--
-- AUTOINCREMENT, because these rows are really deleted and synced: a plain
-- INTEGER PRIMARY KEY hands the highest id out again after its row is
-- deleted, and the new row would inherit the dead row's sync record (and
-- travel to other devices as a deletion).
CREATE TABLE tag (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX tag_name ON tag(name COLLATE NOCASE);

-- Deleting a tag takes it off everything it was on.
CREATE TABLE task_tag (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES task(id),
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  UNIQUE (task_id, tag_id)
);
CREATE INDEX task_tag_tag ON task_tag(tag_id);

-- Tags put on a session by hand. Tags a session has only because its task
-- has them are not here.
CREATE TABLE session_tag (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES session(id),
  tag_id     INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  UNIQUE (session_id, tag_id)
);
CREATE INDEX session_tag_tag ON session_tag(tag_id);
