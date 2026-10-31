-- Migration 010: start and end dates are built-in task fields (owner
-- request, 2026-10-31). Both are local dates (YYYY-MM-DD), set by hand or
-- filled in by a move into a chosen status (setting `task_dates`).
--
-- They are stored, unlike first_started_at and completed_at, which stay
-- derived from the transition log: these are the dates the person says,
-- which may differ from when the card moved.
ALTER TABLE task ADD COLUMN start_date TEXT;
ALTER TABLE task ADD COLUMN end_date TEXT;

-- The Jira import kept start dates in a custom field, start_date. Copy the
-- valid ones across. The custom values stay in the JSON (custom data is
-- never stripped); only the field definition is retired, so the panel
-- shows one Start date, not two.
UPDATE task SET start_date = substr(json_extract(custom, '$.start_date'), 1, 10)
 WHERE json_type(custom, '$.start_date') = 'text'
   AND substr(json_extract(custom, '$.start_date'), 1, 10)
       GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]';

UPDATE custom_field SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE entity = 'task' AND key = 'start_date' AND deleted_at IS NULL;
