-- Migration 013: subtasks (owner request, 2026-11-01, Phase 2.5). Jira's
-- three levels: epic → task → subtask, no deeper. A subtask is an ordinary
-- task (type 'task') whose parent_id points at another ordinary task that
-- has no parent itself. It has its own key, status and sessions; it takes
-- its parent's epic rather than having one (its epic_id stays NULL).
ALTER TABLE task ADD COLUMN parent_id INTEGER REFERENCES task(id);
CREATE INDEX task_parent ON task(parent_id) WHERE deleted_at IS NULL;
