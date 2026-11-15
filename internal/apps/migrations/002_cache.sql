-- The cache of app data widgets (docs/plugins.md section 6.3): the last
-- answer each data widget gave for one set of parameters, so a widget still
-- shows something when its app cannot be reached. Up to 10 MB per app; the
-- least recently read answers are dropped first, nothing expires by age.
-- Removing an app removes its answers (foreign keys are on). A backup leaves
-- these rows out: they are rebuilt by fetching again.
CREATE TABLE app_cache (
  id         INTEGER PRIMARY KEY,
  app        INTEGER NOT NULL REFERENCES app(id) ON DELETE CASCADE,
  widget     TEXT NOT NULL,     -- the data widget's id in the app's description
  params     TEXT NOT NULL,     -- what was asked, e.g. range=7d&group=day&tz=Asia/Kolkata
  answer     TEXT NOT NULL,     -- the answer as checked and converted by Reskon (JSON)
  size       INTEGER NOT NULL,  -- bytes of answer
  fetched_at TEXT NOT NULL,     -- when the app made the answer (UTC)
  read_at    TEXT NOT NULL,     -- when it was last stored or shown (UTC)
  UNIQUE (app, widget, params)
);
CREATE INDEX app_cache_read ON app_cache (app, read_at);
