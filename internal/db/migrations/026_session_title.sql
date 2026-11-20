-- Migration 026: a session's own title (owner request, 2026-11-20).
-- Additive only.
--
-- title: a short name for the session, typed by the person. Lists name a
-- session by its title, else its task's title, else its label (the
-- description). NULL when none was typed, which is every session saved
-- before this migration.
ALTER TABLE session ADD COLUMN title TEXT;
