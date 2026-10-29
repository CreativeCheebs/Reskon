# Deviations from the build spec

Where the code differs from `build_spec_phase_1.md`, and why.

## Multiple users and sign-in (owner request, 2026-10-29)
The spec is single-user with "no auth in Phase 1". The owner asked for a login page and several users on one server, each with separate data, with the first person to open the app becoming admin. Implemented as one SQLite file per person plus `auth.db` (see decisions.md). Consequences:
- `JITTERBUG_DB` is now only the legacy single-user file; the data directory is `JITTERBUG_DATA`.
- New endpoints: `GET /api/auth/status`, `POST /api/auth/setup|login|logout|password`, admin-only `GET|POST /api/users`, `PATCH /api/users/:id`. Everything else under `/api` returns 401 without a session.
- Settings (LLM endpoint, subtype weights) are per person, since they live in each person's database. The `JITTERBUG_LLM_*` env vars remain the server-wide fallback.
- `jitterbug backup <dir>` now writes every database into a directory.
- Users are disabled, never deleted; their file stays on disk.

## Epics, search, grouping, collapsible columns (owner request, 2026-10-29)
- **Epics** are `task.type = 'epic'`, a fixed two-value column rather than a lookup table: code branches on it (an epic has tasks, a task has an epic), which is exactly what rule 7 keeps out of user-editable rows. Derived `epic_tasks` / `epic_done` (cancelled excluded) come back on epics.
- **Filter** gains `types` and `epics` (`0` = no epic). **Search** is `GET /api/tasks?view=:id&q=...`, server-side; every word must appear in the title, key or description, and the view's filter still applies. `GET /api/tasks?type=epic` lists epics for pickers.
- **View settings are split**: Filter (which tasks) and Card/Columns (what they show). Layout, grouping and collapsed columns are changed from the view header and **save immediately** into `view.board_state` / `view.layout`.
- **Grouping** on the board makes swimlanes; cards move between columns within their lane, and a task created in a lane gets that lane's value (e.g. its epic). Grouping by epic puts each epic at the top of its own lane. Table grouping adds Status.
- Collapsed columns are shared by every lane of a view and still accept drops.

## Jira import (owner request, 2026-10-29)
`jitterbug import-jira <export.db> <username> [--dry-run]`, one transaction, refuses if any key already exists. Mapping, all reused by name when they already exist:
- Keys kept (`OM2-N`). Labels MainJob/Personal/Freelance → areas Main job (prefix **OM2**, so new keys continue the sequence) / Personal (PER) / Freelance (FRL); an unlabelled issue takes its parent's label.
- Statuses To Do / In Progress / Done / Cancelled → the seeded ones; **Planned** and **Paused** are created (todo behaviour, on the board), following Jira's own categories.
- Priorities Low/Medium/High → Low/Normal/High; **Highest** (2.0) and **Lowest** (0.5) created. Difficulty Easy/Medium/Hard/Very Hard → 1/2/4/8.
- Status changelog → `status_transition` rows (so completed/started dates and cycle time are Jira's real history). Worklogs → `task` sessions with the area's default energy type (Main job/Freelance: Engineering, Personal: Admin — **review**, change per area before importing if you want otherwise). 0-hour worklogs are skipped.
- Kept without a column: story points → custom field *Jira points*; start date → *Start date*; issue links and sub-task parents → *Jira links*; comments appended to the description; Jira id/type/status/resolution under `custom._jira`.
- Not carried: history of fields other than status (priority, labels, due date edits), assignee/reporter (all empty or you), attachments (none in the export).


### Subtypes ship empty
Section 3 lists subtype seeds; section 12 ("Deferred, not open") says Phase 1 ships the table empty and the user adds their own on first run. Followed section 12 as the later decision. The section 3 list can be added from Settings → Subtypes in a minute.

### All five seeded statuses are builtin
Section 3 marks the categories and priorities builtin but does not say which statuses are. All five seeded statuses (Backlog, To do, In progress, Done, Cancelled) are `is_builtin = 1` so the backlog overlay and the "move out of backlog" rule always have a target.


### Creating an area also creates its board view
Section 7 asks for "one view per area" on first run, but areas ship empty and are created by the user. So `POST /api/areas` creates a board view for the new area in the same transaction. Deleting the area does not delete the view.

### An area with tasks cannot be deleted
The spec does not say what happens to tasks when their area is deleted. Every task needs exactly one area, so deletion is refused with 409 until the tasks are moved. Most reversible option.

### Extra endpoints
- `GET /api/health` — used by the client to detect offline/online.
- `PUT /api/settings/:key` — the spec puts the LLM endpoint and model in `setting` but lists no write endpoint for it. `llm_api_key` is write-only (never returned by bootstrap).
- `GET /api/tasks/:id` — single-task read for the task panel.

### No `task_dates` SQL view
Section 4 shows a `task_dates` view. It is not created; the same values (and more) are computed in `internal/db/derive.go`, to keep one implementation. See decisions.md.

### `cancelled_at` clears when a task leaves cancelled
Section 4 only says Completed returns to NULL when the task moves back out. Cancelled is treated the same way: a reopened task is not "cancelled".

### Points formula
Section 10 lists `points` as a derived field but the spec never gives the formula. Implemented as `difficulty × priority weight` (unset priority = 1.0, no difficulty = no points). See Needs review.

### Filter additions: `open_only` and custom ranges
The **Stuck** view needs "open items only", which the section 7 filter cannot express. Added `"open_only": true` (hides done- and cancelled-behaviour tasks). Custom filters accept a scalar (equality, as in the spec), `null` (key unset), or `{"gte": ..., "lte": ...}` for date/number ranges — "filter by a date field" is rarely an exact date. Unknown filter keys are rejected (400) so a typo cannot silently match everything.

### Table layout always sorts by time in status first
Rows start in time-in-status-descending order even when the "time in status" column is toggled off.

### Energy types and subtypes delete without reassignment
The spec gives a reassign dialog for statuses and priorities only. Energy types and subtypes are soft-deleted and existing tasks/sessions keep pointing at them, so history is unchanged; they stop being offered in pickers.

### Sessions have no optimistic concurrency
Section 9 says writes send the `updated_at` they last saw, but the `session` table has no `updated_at` column. Session edits are last-write-wins until an additive migration adds the column.

### `GET /api/sessions` filters
Accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD&task_id=N`. The spec lists the route without parameters.

### `GET /api/day/:date` shape
Returns `{day, plan, spend: [...], restore: [...], subtype_totals, sessions}`. Spend and restore are two separate lists per energy type; there is no combined figure anywhere.

### Session hours limit
`hours` must be in (0, 24]. Not in the spec; prevents a typo of 25 or 250.

### Capture audit is also stored on tasks
Section 8 says to store the raw input and parse in `session.custom._capture`. Captured tasks get the same `task.custom._capture` — the parser is as likely to be wrong about tasks, and the test corpus needs both.

### Capture response carries `matched_task_id`, `fallback`, `fallback_reason`
Beyond the section 8 contract, so the form can preselect the task without a key lookup and say quietly why it is in manual mode.

### Unknown intent is not guessed
When the parse has no intent (always, in manual mode), the confirm form shows Task / Session with neither selected and Save disabled until one is picked. One extra click, but no silent guess.

### Capture shortcut is Ctrl/⌘+K
The spec asks for "a global shortcut" without naming one.

### Capture settings precedence
`llm_endpoint`, `llm_model`, `llm_api_key` in `setting` win; the env vars `JITTERBUG_LLM_ENDPOINT`, `JITTERBUG_LLM_MODEL`, `JITTERBUG_LLM_API_KEY` are used when a setting is blank. The API key setting is never returned by `/api/bootstrap`.

### Custom fields: no automatic expression indexes
Section 5 shows `CREATE INDEX task_review_due ON task (json_extract(custom, '$.review_due'))` as possible. Indexes are not created automatically when a field is defined; at single-user scale a scan is instant. Add one in a migration if a field is filtered on heavily.

### Custom field keys
Keys must match `^[a-z][a-z0-9_]{0,63}$` so they can be placed in a JSON path safely. A deleted field's key cannot be reused (the `UNIQUE (entity, key)` constraint, and its data is still stored under that key).

### `GET /api/cycle-time?view=:id`
The stacked cycle-time chart needs segments for every task in a view; deriving them client-side would break "one implementation, server-side". Added this endpoint. `GET /api/tasks/:id/transitions` returns `{transitions, segments}`.

### Seeded Everything and Stuck show area and status
Their card configuration turns on the Area and Status columns, since they span every area. Everything else uses the section 7 example defaults.

## Needs review

Gaps where the spec was silent and the most reversible option was taken. Each is small to change.

- **Points formula** (`taskPoints` in `internal/db/derive.go`): `difficulty × priority.weight`. Confirm or give the real formula. Sessions have no points.
- **Subtypes ship empty** (section 3 vs section 12). Flip by adding the section 3 list to a new migration's seeds.
- **All seeded statuses are built-in.** Un-builtin any of them with `UPDATE status SET is_builtin = 0 WHERE ...`.
- **Area deletion is refused while tasks remain** (409). Alternative: a reassign dialog like statuses.
- **Sessions have no `updated_at`**, so their edits are last-write-wins. An additive migration can add the column.
- **Capture with unknown intent** leaves Task/Session unselected rather than defaulting to one.
- **Progress bar** is `logged hours / estimate`, capped at 100% (`progress_pct`). The spec names a progress bar without saying of what.
- **Card "subtypes"** shows the distinct subtypes of sessions logged against the task (tasks have no subtypes of their own).
