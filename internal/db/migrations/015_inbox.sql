-- Migration 015: the inbox (owner request, 2026-11-01, Phase 2.5). A
-- shortcut drops a bare line here without asking for an area or a status.
-- Triage turns it into a task or a session (through quick capture), which
-- sets triaged_at, or discards it, which soft-deletes it.
CREATE TABLE inbox_item (
  id         INTEGER PRIMARY KEY,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  triaged_at TEXT,
  deleted_at TEXT
);
CREATE INDEX inbox_open ON inbox_item(created_at) WHERE triaged_at IS NULL AND deleted_at IS NULL;
