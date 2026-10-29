# Schema

Every table, one line on what it is for. There are two kinds of database file:

- `<data>/auth.db` — accounts. Source: `internal/auth/migrations/`.
- `<data>/users/*.db` — one per person, the JitterBug schema below. Source: `internal/db/migrations/`.

## auth.db, migration 001

| Table | Purpose |
| --- | --- |
| `user` | An account: lower-case `username`, bcrypt `password_hash`, `is_admin`, `db_file` (that person's database, relative to the data directory), `disabled_at` (cannot sign in; data kept). |
| `login_session` | One row per signed-in browser. Stores the sha256 of the cookie token, never the token. `expires_at` slides forward while used. |

## User database
Applied migration version is kept in `PRAGMA user_version` (no bookkeeping table).

### Migration 001

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
| `setting` | Key → JSON value. `subtype_weights` (rank → weight list), `llm_endpoint`, `llm_model`, `llm_api_key` (write-only via the API). |

Seeds: the four status categories, five statuses (all built-in; Backlog and Cancelled hidden from the board), three priorities, five energy types, three custom field presets, the Everything and Stuck views, and default settings. Areas and subtypes ship empty.

### Migration 002

| Change | Purpose |
| --- | --- |
| `task.type` (`'task'` / `'epic'`, default `'task'`) | Epics are tasks of type epic. |
| `task.epic_id` → `task(id)` | The epic an ordinary task belongs to. Epics cannot belong to an epic. Deleting an epic clears this on its tasks. |
| `view.board_state` (JSON, default `{}`) | UI state saved as you use a view: `collapsed` (status ids) and `group_by` (`none`, `epic`, `priority`, `area`, `energy_type`, `difficulty`, `type`, `status`). |
