-- Migration 014: dependencies (owner request, 2026-11-01, Phase 2.5), after
-- Jira's "blocks / is blocked by". A link says blocker_id must be finished
-- before blocked_id can go ahead. Removing a link soft-deletes it.
CREATE TABLE task_link (
  id         INTEGER PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES task(id),
  blocked_id INTEGER NOT NULL REFERENCES task(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX task_link_pair ON task_link(blocker_id, blocked_id) WHERE deleted_at IS NULL;
CREATE INDEX task_link_blocked ON task_link(blocked_id) WHERE deleted_at IS NULL;

-- Snooze until unblocked: the task is hidden while any task blocking it is
-- still open. Cleared once nothing open blocks it, and by Wake.
ALTER TABLE task ADD COLUMN snooze_until_unblocked INTEGER NOT NULL DEFAULT 0;
