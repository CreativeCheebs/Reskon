-- Keys connected apps use to say "my data changed" from their own server
-- (POST /api/apps/changed, docs/plugins.md section 7). The call carries no
-- cookie, so the key alone must say whose app it is: that is why this list
-- is here, beside the accounts, and not in each person's apps file. Only a
-- hash of the key is kept; the key itself went to the app and nowhere else.
CREATE TABLE app_hook (
  key_hash   TEXT PRIMARY KEY,                    -- sha256 of the key
  user_id    INTEGER NOT NULL REFERENCES user(id),
  app_id     TEXT NOT NULL,                       -- the id in the app's description file
  created_at TEXT NOT NULL,
  UNIQUE (user_id, app_id)                        -- one key per person per app
);
