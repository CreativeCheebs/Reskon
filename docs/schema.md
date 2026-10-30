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

### Migration 003

No schema change. Remaps `task.difficulty` and `session.difficulty` from 1/2/4/8/16 to the 1-5 scale (4→3, 8→4, 16→5), and saved view filters' `difficulty_min` the same way.

### Migration 004

| Change | Purpose |
| --- | --- |
| `view.icon` (JSON, default `{}`) | `{"emoji": "🚀"}` or `{"set": "fluent-regular" \| "fluent-filled" \| "prime", "name": ..., "svg": "<path .../>"}`. The SVG body is kept on the view so the sidebar needs no icon library; it is drawn as a CSS mask, never inserted as markup. |
| `view.color` (`#rrggbb` or NULL) | Tints the view's icon. NULL = theme text colour. |
| `view.background` (JSON, default `{}`) | `image_id`, `fit` (`cover` = crop, `contain` = fit, `stretch`), `opacity` (0-1, of the image), `blur` (px), `surface_opacity` (0-1, how solid columns and tables are over the image). |
| `image` (`id`, `mime`, `data` BLOB, `created_at`) | Uploaded background images: PNG, JPEG, GIF or WebP, at most 8 MB. Images no live view uses are deleted when a view's background changes or a view is deleted, once they are an hour old. Served by `GET /api/images/:id`; uploaded by `POST /api/images` with the raw file as the body. |
