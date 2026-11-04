-- Migration 017: owner review, 2026-11-04. Additive only.

-- Sessions record when they last changed, like tasks. Between devices each
-- field keeps its latest change (sync); this is the time shown and kept.
ALTER TABLE session ADD COLUMN updated_at TEXT;
UPDATE session SET updated_at = created_at;

-- Every change to a session stamps updated_at, from any code path. Not
-- while sync applies another device's change: that brings its own.
CREATE TRIGGER session_touch AFTER UPDATE ON session
WHEN NEW.updated_at IS OLD.updated_at AND (SELECT value FROM sync_meta WHERE key = 'applying') = '0'
BEGIN
  UPDATE session SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER session_born AFTER INSERT ON session WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE session SET updated_at = NEW.created_at WHERE id = NEW.id;
END;

-- Unfinished parts are hidden until they are designed (next phase): the
-- Stuck view, and the Stuck work and Drift widgets. Rows are kept.
UPDATE view SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 2 AND name = 'Stuck' AND deleted_at IS NULL;
UPDATE widget SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE deleted_at IS NULL AND (title = 'Stuck work' OR json_extract(query, '$.metric') = 'drift');

-- Tasks already in progress before start dates existed get the day they
-- first moved into an in-progress status.
UPDATE task SET start_date = (
    SELECT date(min(t.at), 'localtime') FROM status_transition t
    JOIN status s ON s.id = t.to_status_id
    JOIN status_category c ON c.id = s.category_id
    WHERE t.task_id = task.id AND c.behaviour = 'in_progress')
  WHERE start_date IS NULL AND EXISTS (
    SELECT 1 FROM status_transition t
    JOIN status s ON s.id = t.to_status_id
    JOIN status_category c ON c.id = s.category_id
    WHERE t.task_id = task.id AND c.behaviour = 'in_progress');
