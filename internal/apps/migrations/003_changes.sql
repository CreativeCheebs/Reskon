-- Whether Reskon could hand the app its "my data changed" key at its
-- connect_url (docs/plugins.md section 7), so Settings › Apps can say when
-- Reskon won't hear about changes made elsewhere. The key itself is not
-- here: only its hash is kept, in auth.db (app_hook).
ALTER TABLE app ADD COLUMN changes TEXT NOT NULL DEFAULT '';        -- '' (the app has no connect_url), ok or failed
ALTER TABLE app ADD COLUMN changes_detail TEXT NOT NULL DEFAULT ''; -- why it failed, in Reskon's words
