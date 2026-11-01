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
| `energy_type` | Engineering, Physical, Admin, Rest, Leisure… All equal (Change 001). `direction` is no longer read (migration 006); `points_per_hour` is the type's rate. |
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

### Migration 005 (Phase 2)

| Change | Purpose |
| --- | --- |
| `dashboard` (`name`, `position`, `is_builtin`, `deleted_at`) | A named dashboard. Seeded: Today, This month, The year (all editable and deletable). |
| `widget` (`dashboard_id`, `title`, `viz`, `query`, `options`, `x`, `y`, `w`, `h`, `position`, `deleted_at`) | One widget: a metric query (JSON: `metric`, `group`, `range` or `from`/`to`, `filters`, `split`, `reduce`) plus a visualisation (`bar`, `line`, `cumulative`, `number`, `list`, `bands`, `split_bar`, `table`). `x/y/w/h` are grid units on a 12-column grid; `position` is the single-column (mobile) order. |
| `session.points` (REAL) | Stored when the session is logged: hours × difficulty (the session's, else its task's, else 1); since 006, × the type's rate too. Never recalculated by an edit; editable by hand. Backfilled once here for spend sessions, and by 006 for the rest. |
| `day_plan.ceiling_feedback` (`about_right` / `too_high` / `too_low` / NULL) | The evening answer to "was today's ceiling about right?". Drives the suggested ceilings of the following days. |
| settings `week_start` (1 = Monday … 7 = Sunday, default 1), `drift_low_hours` (default 1) | Week grouping in metrics; the spend below which a day counts as low-work for the Drift widget. |

### Migration 006 (Change 001: all energy types are equal)

| Change | Purpose |
| --- | --- |
| `energy_type.points_per_hour` (REAL, NOT NULL, default 1) | Every type's points rate. Points = hours × rate × difficulty. Editable in Settings → Energy types; a new rate applies to sessions logged after it. |
| `energy_type.direction` | Kept (additive only), no longer read. New types get a filler value. |
| `session.points` backfill | Sessions with no points (the old restore types) get hours × rate × difficulty, once. |
| `day_plan.ceiling_feedbacks` (JSON, default `{}`) | `{"<energy_type_id>": "about_right" \| "too_high" \| "too_low"}`: the evening question, per type that had a ceiling. A day's old single answer is copied to each type it had a ceiling for. `day_plan.ceiling_feedback` is no longer read. |
| setting `drift_energy_types` (JSON list of ids) | The types whose hours Drift adds up. Seeded with the old spend types. |
| widgets | `work_points` → `points` and the `direction` filter removed in every saved query. The built-in dashboards' widgets are soft-deleted and replaced with Change 001's layout; your own dashboards are not touched. |

### Migration 007 (dashboard shares and running totals)

| Change | Purpose |
| --- | --- |
| widget `viz` | Two more: `pie` (each group value's share of the whole) and `share_bar` (each day, week or month stacked to 100% by its split). A widget query may carry `"cumulative": true`, which small multiples use for one running total per series. |
| built-in widgets | The year: "Points, cumulative" is soft-deleted and replaced by running totals per energy type (points and hours), plus each week's share by type. Today: two pies by energy type, hours and points. This month: each day's share by type (hours and points) and the month's pies. Built-in dashboards only. |

### Migration 008 (retire "Energy drain felt")

| Change | Purpose |
| --- | --- |
| custom_field `energy_drain_felt` (session) | Soft-deleted. It had no answer for leisure and events and could not say which energy type it meant. The row stays, and values already on sessions stay in their `custom` JSON. Restore it by clearing `deleted_at`. |

### Migration 009 (several energy types in one session)

| Change | Purpose |
| --- | --- |
| `session_energy` (new) | One row per energy type of a session with two or more: `share` of its hours (0..1, the rows add up to 1), `difficulty` (its intensity), `points` (stored when logged: hours × share × rate × intensity, the part's else the task's else 1), `position`. A one-type session has no rows and is read as itself at share 1. With rows, the session's `energy_type_id` and `difficulty` are the first part's and its `points` the sum of the parts'. Nothing existing is changed. |

### Migration 010 (built-in start and end dates)

| Change | Purpose |
| --- | --- |
| `task.start_date`, `task.end_date` (new, TEXT `YYYY-MM-DD`, nullable) | Dates the person sets in the task panel, or that a move fills in under the `task_dates` setting (see below). Stored, unlike `first_started_at` / `completed_at`, which stay derived from the transition log. |
| copy from custom `start_date` | Valid values of the Jira import's `start_date` custom field are copied into `task.start_date`. The values stay in `custom` (never stripped). |
| custom_field `start_date` (task) | Soft-deleted, so the panel shows one Start date. Restore it by clearing `deleted_at`. |

Setting `task_dates`: `{"start_auto": true, "start_statuses": [ids] | null, "end_auto": true, "end_statuses": [ids] | null}`. Absent or `null` lists mean the defaults by behaviour: start on `in_progress`, end on `done` and `cancelled`. A move into a start status fills an empty start date; a move into an end status fills an empty end date; a move back to a `todo` or `in_progress` status clears the end date (only while `end_auto` is on). Moves carry the client's local date as `today`.

View `board_state` (JSON, no migration) gains `sort` (card order in board columns: `manual`, `priority`, `due`, `difficulty`, `estimate`, `time_in_status`, `newest`, `oldest`) and `limits` (`{status_id: {max, unit: "tasks" | "points" | "hours", hard}}`). View `card_config` gains `icons_only` and `show.start_date` / `show.end_date` / `show.pace`.

### Migration 011 (snooze)

| Change | Purpose |
| --- | --- |
| `task.snoozed_until` (new, TEXT `YYYY-MM-DD`, nullable) | The local date a snoozed task shows again. Set only by `POST /api/tasks/:id/snooze` (`{days, today}`: today + days; `days: 0` clears it), never by PATCH. Not a status: no transition is written and the task keeps its status and position. A move into a `done` or `cancelled` status clears it. |

Derived `snoozed` (on read): the task is `todo` or `in_progress` and `snoozed_until` is after today in the server's time zone. From that day on the task simply shows again; the stored date is left in place.

Setting `snooze`: `{"max_days": 30}` (1 to 365; absent means 30). Snoozing for more days is refused.

Setting `card_actions` (no migration; read by the client only): `{"rail": ["log", "snooze"], "menu": ["log", "snooze", "note", "move", "open", "delete"]}`. `rail` lists the board card's hover buttons (up to 3), `menu` its right-click items. Absent means these defaults; unknown keys are ignored.

### Migration 012 (duplicate search cache)

| Change | Purpose |
| --- | --- |
| `task_embedding` (new) | One row per task: `model` (`all-MiniLM-L6-v2`), `text_hash` (of the title it was made from) and `vector` (384 little-endian float32). A cache for `GET /api/tasks/similar`, not data: a row whose model or hash no longer matches is made again, and emptying the table loses nothing. |

The model files live in `<data>/models/all-MiniLM-L6-v2/` (`vocab.txt`, `model.safetensors`; override with `JITTERBUG_EMBED_DIR`), shared by every user. An admin downloads them once from Settings → Duplicate search (`POST /api/semantic/download`, pinned revision, SHA-256 checked); after that nothing leaves the server.

Setting `task_completeness`: `{"required": ["start_date", "estimate_h", "difficulty", ...]}`, any of `start_date`, `end_date`, `due_at`, `estimate_h`, `difficulty`, `priority_id`, `energy_type_id`, `description`, `epic_id`. Absent or empty means every task is complete. Derived `missing` on each task lists the required fields an open (`todo` / `in_progress`) task of type `task` lacks; it is empty for done, cancelled and epics.

### Migration 013 (subtasks)

| Change | Purpose |
| --- | --- |
| `task.parent_id` (new, INTEGER → `task.id`, nullable) | Set on a subtask: the ordinary task it belongs to. Three levels only, after Jira: epic → task → subtask. The parent must be type `task` with no parent of its own; an epic cannot be a subtask; a task with subtasks cannot become a subtask or an epic. A subtask takes its parent's epic, so its own `epic_id` stays NULL. Created without `area_id`, it takes the parent's area. Deleting the parent leaves its subtasks as ordinary tasks. |

Derived on every task: `subtask_count` (its subtasks, cancelled left out) and `subtask_done`. `GET /api/tasks?parent=:id` lists one task's subtasks. A view's filter gains `subtasks` (boolean, default false): views leave subtasks out unless it is true.

### Migration 014 (dependencies)

| Change | Purpose |
| --- | --- |
| `task_link` (new) | `blocker_id` must finish before `blocked_id` can go ahead (Jira's "blocks / is blocked by"). Unique per live pair; soft-deleted. A link that would make a loop is refused. `POST /api/task-links {blocker_id, blocked_id}` returns the blocked task; `DELETE /api/task-links/:id` removes one. |
| `task.snooze_until_unblocked` (new, INTEGER 0/1) | Set only by `POST /api/tasks/:id/snooze {until_unblocked: true}`, and only while an open task blocks it. Cleared by waking, by a dated snooze, by finishing the task, and automatically once nothing open blocks it (after a move, a removed link or a deleted task). |

Derived: `blocked_by` and `blocks` (lists of `{link_id, id, key, title, status_id, behaviour}`, deleted tasks left out) and `blocked` (any task in `blocked_by` is open). `snoozed` is now also true while `snooze_until_unblocked` is set and the task is blocked and open.

View `board_state` (no migration) gains `hide_blocked` (absent means true: blocked tasks are listed under the toolbar's Blocked button instead of the board or table).
