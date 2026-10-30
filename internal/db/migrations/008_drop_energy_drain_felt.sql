-- Migration 008: the "Energy drain felt" session field is retired. Leisure
-- and events have no sensible answer to it, and it could not say which
-- energy type it was about. Soft-deleted only: the definition stays in the
-- table, and any values already on sessions stay in their custom JSON.
UPDATE custom_field SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE entity = 'session' AND key = 'energy_drain_felt' AND deleted_at IS NULL;
