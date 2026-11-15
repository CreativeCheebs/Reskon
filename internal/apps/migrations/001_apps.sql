-- Connected apps (plugins), one file per person beside their database:
-- users/<name>-<id>.apps.db. It is never synced and never sent to the
-- browser as is: the token column stays on the server (docs/decisions.md,
-- "Plugins (connected apps) and live updates").
CREATE TABLE app (
  id            INTEGER PRIMARY KEY,
  app_id        TEXT NOT NULL UNIQUE,  -- the id in the app's description file
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,         -- base address, e.g. http://192.168.0.8:5000
  manifest      TEXT NOT NULL,         -- the description file as last read (JSON)
  auth_kind     TEXT NOT NULL,         -- none, token or password
  token         TEXT,                  -- what Reskon signs in with; never leaves the server
  status        TEXT NOT NULL,         -- ok, unreachable, invalid
  status_detail TEXT NOT NULL DEFAULT '',
  checked_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
