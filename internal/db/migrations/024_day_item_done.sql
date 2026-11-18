-- Migration 024: planner lines (owner feedback, 2026-11). Additive only.
--
-- An event is done only when the user marks it, not when a session is saved:
-- done_at holds the moment it was marked (NULL = not done). Task lines are
-- unchanged: their done still follows the task's status.
--
-- A task line may now carry its own title and planned minutes for its day
-- (the existing title and planned_min columns, which were NULL for task
-- lines), so no other change is needed.
ALTER TABLE day_item ADD COLUMN done_at TEXT;
