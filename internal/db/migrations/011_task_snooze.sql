-- Migration 011: snoozing a task (owner request, 2026-11-01). A snoozed
-- task is hidden from boards and tables until snoozed_until, a local date
-- (YYYY-MM-DD): it shows again from that day. NULL means not snoozed.
-- Whether a task is snoozed now is derived on read (`snoozed`).
ALTER TABLE task ADD COLUMN snoozed_until TEXT;
