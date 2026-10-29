-- Migration 003: difficulty moves from 1/2/4/8/16 (which read like hours)
-- to a 1-5 scale. Values map in order, so relative difficulty is kept:
-- 1->1, 2->2, 4->3, 8->4, 16->5. No schema change.

UPDATE task SET difficulty = CASE difficulty
    WHEN 4 THEN 3 WHEN 8 THEN 4 WHEN 16 THEN 5 ELSE difficulty END
  WHERE difficulty IN (4, 8, 16);

UPDATE session SET difficulty = CASE difficulty
    WHEN 4 THEN 3 WHEN 8 THEN 4 WHEN 16 THEN 5 ELSE difficulty END
  WHERE difficulty IN (4, 8, 16);

-- Saved view filters with a minimum difficulty follow the same mapping.
UPDATE view SET filter = json_set(filter, '$.difficulty_min',
    CASE json_extract(filter, '$.difficulty_min') WHEN 4 THEN 3 WHEN 8 THEN 4 WHEN 16 THEN 5 END)
  WHERE json_extract(filter, '$.difficulty_min') IN (4, 8, 16);
