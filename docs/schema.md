# Schema

Every table, one line on what it is for. Source: `internal/db/migrations/`.
Applied migration version is kept in `PRAGMA user_version` (no bookkeeping table).

## Migration 001

| Table | Purpose |
| --- | --- |
| `status_category` | The four behaviours (`todo`, `in_progress`, `done`, `cancelled`) that code branches on. Statuses map to one. |
| `status` | User-editable workflow statuses. `on_board = 0` hides a status from the board (Backlog, Cancelled). `alert_after_days` flags stalled tasks. |
| `priority` | User-editable priorities with a `weight` multiplier used in points (centred on 1.0). |
| `energy_type` | Engineering, Physical, Admin, Rest, Leisure… `direction` is `spend` or `restore`; the two are never netted. |
| `subtype` | Finer activity kinds, each belonging to one energy type. Ships empty. |
| `area` | Main job / Personal / Freelance… Owns the task key prefix and a default energy type. |
| `task` | The work item. Exactly one area. `key` is permanent. `board_pos` is fractional. `custom` holds custom field values as JSON. No dates beyond created/updated/deleted — the rest derive from `status_transition`. |
| `status_transition` | Append-only log of every status change, including creation (`from_status_id` NULL). Source of every derived date. |
| `session` | Logged time: `kind = 'task'` (work) or `'event'` (things that happened, not work). Carries hours and an energy type. |
| `session_subtype` | Up to four ranked subtypes per session; rank maps to a weight via the `subtype_weights` setting. |
| `day_plan` | Per-day focus and energy ceilings. No Phase 1 UI. |
| `state` | Buffs, debuffs, modifiers with a decay curve. No Phase 1 UI; API exists. |
| `view` | Saved views: filter + layout (`board`/`table`) + card configuration. |
| `custom_field` | Definitions for keys in `task.custom` / `session.custom`. `key` and `type` are immutable. |
| `setting` | Key → JSON value. `subtype_weights`, `llm_endpoint`, `llm_model`, `llm_api_key`. |
