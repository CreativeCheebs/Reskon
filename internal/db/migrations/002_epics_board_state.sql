-- Migration 002: epics, and per-view board state. Additive only.

-- A task is either an ordinary task or an epic. Tasks may belong to one
-- epic; epics cannot belong to an epic.
ALTER TABLE task ADD COLUMN type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'epic'));
ALTER TABLE task ADD COLUMN epic_id INTEGER REFERENCES task(id);
CREATE INDEX task_epic ON task(epic_id) WHERE deleted_at IS NULL;

-- UI state saved as you use the view: collapsed columns, grouping.
-- {"collapsed": [status_id, ...], "group_by": "none" | "epic" | ...}
ALTER TABLE view ADD COLUMN board_state TEXT NOT NULL DEFAULT '{}';
