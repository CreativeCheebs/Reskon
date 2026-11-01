-- Migration 012: a cache of meaning vectors for duplicate search (owner
-- request, 2026-11-01). One row per task: the model that made it, a hash of
-- the text it was made from (the title), and 384 little-endian float32s.
-- It is a cache, not data: rows whose hash or model no longer match are
-- simply made again, and deleting the table's rows loses nothing.
CREATE TABLE task_embedding (
  task_id   INTEGER PRIMARY KEY REFERENCES task(id),
  model     TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  vector    BLOB NOT NULL
);
