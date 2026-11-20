-- Migration 025: continue a task, and rounds of the same task (owner
-- request, 2026-11-20). Additive only.
--
-- follows_id: the task this one continues ("comes after"). The tasks that
-- continue a task are found by looking for its id here, so "next" is not
-- stored.
--
-- round_of, round_no, round_kind: a task done again. Every round of a
-- series has round_of set to the first round's id (the first round points
-- at itself) and its own number, which never changes, even when another
-- round is deleted. round_kind is 'round' (shown #3) or 'version' (v3),
-- the same on every round of a series. All NULL for a task that has never
-- had a next round.
ALTER TABLE task ADD COLUMN follows_id INTEGER REFERENCES task(id);
ALTER TABLE task ADD COLUMN round_of INTEGER REFERENCES task(id);
ALTER TABLE task ADD COLUMN round_no INTEGER;
ALTER TABLE task ADD COLUMN round_kind TEXT;
CREATE INDEX task_follows ON task(follows_id) WHERE follows_id IS NOT NULL;
CREATE INDEX task_round_of ON task(round_of) WHERE round_of IS NOT NULL;
