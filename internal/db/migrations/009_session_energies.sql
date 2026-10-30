-- Migration 009: a session can involve more than one energy type. Each part
-- has a share of the session's hours (shares add up to 1, so time is never
-- counted twice), its own intensity (stored as difficulty, like the
-- session's) and its own points, stored when logged.
--
-- A session with one energy type has no rows here: its own energy_type_id,
-- difficulty and points are the whole of it, as before. A session with two
-- or more has one row per type; its energy_type_id and difficulty are then
-- those of the first part (position 0) and its points the sum of the parts'.
-- Readers take the rows when there are any, else the session itself.
CREATE TABLE session_energy (
  session_id     INTEGER NOT NULL REFERENCES session(id),
  energy_type_id INTEGER NOT NULL REFERENCES energy_type(id),
  share          REAL NOT NULL CHECK (share > 0 AND share <= 1),
  difficulty     INTEGER,
  points         REAL,
  position       INTEGER NOT NULL,
  PRIMARY KEY (session_id, energy_type_id)
);
CREATE INDEX session_energy_type ON session_energy(energy_type_id);
