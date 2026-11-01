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
- **Epics** are `task.type = 'epic'`, a fixed two-value column rather than a lookup table: code branches on it (an epic has tasks, a task has an epic), which is exactly what rule 7 keeps out of user-editable rows. Derived `epic_tasks` / `epic_done` / `epic_estimate_h` (cancelled excluded) and `epic_logged_h` (every hour logged against the epic's tasks, cancelled ones included) come back on epics. `GET /api/tasks?epic=:id` lists one epic's tasks for its panel.
- **Filter** gains `types` and `epics` (`0` = no epic). **Search** is `GET /api/tasks?view=:id&q=...`, server-side; every word must appear in the title, key or description, and the view's filter still applies. `GET /api/tasks?type=epic` lists epics for pickers. `GET /api/tasks?brief=1` lists every task with only id, key, title, type, area, energy type and status behaviour, for task pickers (about a tenth of the full list).
- **View settings are split**: Filter (which tasks) and Card/Columns (what they show). Layout, grouping and collapsed columns are changed from the view header and **save immediately** into `view.board_state` / `view.layout`.
- **Grouping** on the board makes swimlanes; cards move between columns within their lane, and a task created in a lane gets that lane's value (e.g. its epic). Grouping by epic puts each epic at the top of its own lane. Table grouping adds Status.
- Collapsed columns are shared by every lane of a view and still accept drops.

## Board layout pass (owner request, 2026-10-29)
- **Quick capture button** is a round "+" in the sidebar header, not bottom right (section 8). Bottom right sat over the last column, its cards and the board's scrollbar. It is still on every screen, and Ctrl/⌘+K is unchanged.
- **Board cards never show the status**; the column already says it. The Status option is left out of a board view's Card settings and still applies to the table layout.
- **Backlog / Cancelled** (any status with `on_board = 0`) open from quiet links beside the search box instead of a row of buttons above the board.

## View icons, backgrounds, colour picker, column widths (owner request, 2026-10-29)
- **Views have an icon, a colour and a background** (migration 004: `view.icon`, `view.color`, `view.background`, table `image`). Icons are emoji or SVGs from Microsoft's Fluent UI System Icons (24px regular and filled) and PrimeIcons, both MIT, picked with a search box. The data is generated from the `@iconify-json/fluent`, `@iconify-json/prime` and `unicode-emoji-json` packages by `web/scripts/icons.mjs` at build time and fetched only when the picker opens. The chosen SVG is stored on the view and drawn as a CSS mask, never inserted as markup.
- **Background images** are uploaded to `POST /api/images` (PNG, JPEG, GIF or WebP, at most 8 MB, type sniffed from the bytes, no SVG) and stored in the person's own database. A view sets fit (crop, fit, stretch), image opacity, blur, and how transparent its columns or table are. Cards stay solid.
- **One colour picker everywhere**, with tabs: a free picker, PrimeReact (its Aura palette, identical to Tailwind CSS v3's) and Material Design (2014 palette). The swatches live in `web/src/theme/swatches.ts`.
- **Table column widths** can be dragged and are kept in this browser only (localStorage, per view, plus the sessions, epic and hidden-status tables), since screen sizes differ between machines.
- **Cards show priority and difficulty as symbols**: priority as Jira-style chevrons in the priority's colour, picked by its rank by weight (never its name); difficulty 1-5 as a ring holding a circle, triangle, square, pentagon or hexagon in blue, green, yellow, orange, red. Tables, the task panel and capture show the same symbols next to the name or number. The purple stripe on epic cards is gone; the epic symbol is enough.
- **Theme files gain `shadow` and `difficulty1`-`difficulty5`.** Older theme files without them still load; the missing colours come from the default theme, with a note.

## Jira import (owner request, 2026-10-29)
`jitterbug import-jira <export.db> <username> [--dry-run]`, one transaction, refuses if any key already exists. Mapping, all reused by name when they already exist:
- Keys kept (`OM2-N`). Labels MainJob/Personal/Freelance → areas Main job (prefix **OM2**, so new keys continue the sequence) / Personal (PER) / Freelance (FRL); an unlabelled issue takes its parent's label.
- Statuses To Do / In Progress / Done / Cancelled → the seeded ones; **Planned** and **Paused** are created (todo behaviour, on the board), following Jira's own categories.
- Priorities Low/Medium/High → Low/Normal/High; **Highest** (2.0) and **Lowest** (0.5) created. Difficulty Easy/Medium/Hard/Very Hard → 1/2/3/4.
- `--area label=Name` puts a label's issues into an existing area instead. An existing area with no default energy type gets the mapped energy type on imported rows only (reported), so no worklog is dropped.
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

### `GET /api/sessions` filters and bulk changes
Accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD&task_id=N&energy_type=1,2&area=1,2&kind=task|event&has_task=true|false&has_difficulty=true|false&has_subtypes=true|false&q=words` (all server-side). `POST /api/sessions/bulk` takes `{ids, set:{energy_type_id|kind|area_id|difficulty|logged_for|task_id}}` or `{ids, delete:true}` and applies it in one transaction, refusing everything if any id is missing. Detaching keeps the task's title as the label; attaching takes the task's area. Hours, notes, labels and subtypes stay per-session edits. The Sessions screen selects rows, whole days, or everything shown; hidden rows drop out of the selection when filters change.

### `GET /api/day/:date` shape
Returns `{day, plan, spend: [...], restore: [...], subtype_totals, sessions}`. Spend and restore are two separate lists per energy type; there is no combined figure anywhere. *Since Change 001: one `totals` list; see below.*

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
The stacked cycle-time chart needs segments for every task in a view; deriving them client-side would break "one implementation, server-side". Added this endpoint. `GET /api/tasks/:id/transitions` returns `{transitions, segments}`. Each task also carries `status_hours` (its segments summed per status) for the chart's hover breakdown, so the client never adds up time in status itself.

### Cycle time chart: shades for statuses that share a colour
Statuses that share a colour would be indistinguishable on the stacked bars, so on the cycle-time chart only, the first such status (by board order) keeps the colour and each later one gets the lighter or darker shade of it furthest from the other colours on the chart. Everywhere else statuses show their own colour.

### Seeded Everything and Stuck show area and status
Their card configuration turns on the Area and Status columns, since they span every area. Everything else uses the section 7 example defaults.

## Phase 2 (`build_spec_phase_2.md`)

### Migration 005, not 002
The Phase 2 spec names its migration 002; 002-004 were already used, so it is `005_dashboards_points.sql`.

### Session points formula (owner decision, 2026-10-30)
The spec stores a session's points at log time but gives no formula. Owner chose **hours × difficulty**, difficulty being the session's, else its task's, else 1. Restore-direction sessions store no points (NULL). There is no separate rate. `points` is editable by hand (`PATCH /api/sessions/:id {"points": n}`); no edit recalculates it. Jira-imported sessions get points the same way. *Changed by Change 001: every type earns points, at hours × the type's rate × difficulty; see below.*

### `day_plan.ceiling_feedback` column
Section 8 says no other schema changes are needed, but `day_plan` has nowhere to keep the evening "was today's ceiling about right?" answer, which section 6 needs to persist. Added one nullable column in migration 005. `day_plan.locked_at` stays unused: days are never locked.

### Metrics API details
- **Ranges** add `today` and `month` (this calendar month) to the spec's `7d / 30d / 90d / 1y / all`. The default dashboards need "today" and "this month", and a saved widget cannot hold relative `from`/`to` dates.
- ~~Spend and restore never share a query~~: removed by Change 001. There is no direction guard; a split across every type is the normal case.
- **Extra groupings**: `session_hours` by `session` (one row per session, for the Today dashboard's "today's work" table); `drift` is an 11th metric (group `now`) for the Drift widget, since section 5 gives it no metric.
- ~~Extra filter `direction`~~: removed by Change 001. A saved query that still has it is rewritten by migration 006; a new one is a 400.
- **Filters per metric**, not "everywhere": each metric lists the filters that mean something for it (a status filter on session hours does not); others are a 400. The catalog says which.
- **Filter values** are ids or names (matched without regard to case); the editor saves ids so renames do not break widgets.
- **By subtype**, hours and points carry the subtype's rank weight (the existing weighted subtype hours); sessions without a subtype are left out of subtype groupings. Counts count a session once per subtype.
- **Epics are left out of task metrics.** Time in status and cycle time leave out statuses with behaviour done/cancelled; time in status also leaves out statuses off the board (Backlog) unless filtered for, so "Stuck work" is not the backlog.
- **Cycle time** is hours in open statuses *within the range*, segments clipped to its local-day edges.
- **Reductions and running totals are server-side** (`reduce`: sum, nonzero, max, last, count; `cumulative=1`, set automatically for a `cumulative` widget), so the client never adds numbers up. Each response carries `total`.
- **An empty range returns `points: []`**; a range with any data returns every day/week/month in it, zeros included. `days_over_plan` and `ceiling_vs_actual` by day list only days with a saved plan.
- **Widgets fetch by id**: `GET /api/metrics?widget=:id` runs the saved query, as views do. The full query string is for the editor's preview.
- **Local days for timestamps** (task completions, transitions) use the server's time zone (`TZ`; the container ships tzdata).

### Default dashboards
*Replaced by Change 001's layout (migration 006).* Before that: as section 5, with these substitutions: **Today**'s "today's sessions" is "Today's work", spend sessions only (one query cannot mix directions); "active states" is "In force". **This month**'s "counts" are four number widgets: tasks closed, sessions logged, rest hours, days with something in the way (gym sessions need a subtype the app does not ship). **The year**'s "rest days per month" is **rest hours per month**, since the day label (rest/normal/heavy) is deferred.

### Ceiling suggestion
The suggestion is the last saved ceiling for each energy type, carried forward. After "too high" it is 80% of that day's ceiling for three days, then eases back over four (85, 90, 95, 100%), rounded to quarter hours. A later answer of any kind ends the hold. Since Change 001 all of this is per energy type: "too high" for one type holds only that type. Nothing is saved until the user taps **Keep this plan** or changes something, so an untouched day has no plan (and no over-plan warning). States in force are listed, never entered, on the plan.

### Dashboard layout
`position` (the phone order) is rewritten from the grid's reading order on every layout save, since phones have no editing to set it otherwise. Under 768px the sidebar folds away behind a tab, for every screen.

### Buffs and debuffs
Clear sets `cleared_on`: for a state past its duration, the day the duration ran out; otherwise today. Either can be changed in its form. Delete (only offered once cleared) removes the row; clearing is the normal way to end one. `GET /api/states` items gain `in_force`, `days_running` and `ended`, and sort in force first, then by days running. `GET /api/states/shapes` samples each decay curve for the picker's sketches.

### Settings
`week_start` (1 = Monday … 7 = Sunday), `drift_low_hours` and `drift_energy_types` (Settings → Reflection).

## Change 001: all energy types are equal (`docs/changes/001-all-energy-types-equal.md`)

### Migration 006, not 002
Change 001 folds its schema into "migration 002". Migration 005 had already run on existing databases, so the change is `006_energy_types_equal.sql`.

### Points rate
`energy_type.points_per_hour` (default 1) for every type. Points = hours × rate × difficulty (the session's, else its task's, else 1). With every rate at 1 this equals the earlier hours × difficulty, so points already stored are unchanged; only sessions with no points (old restore types) are backfilled. The rate is editable in Settings → Energy types and applies from then on. Change 001 does not say the rate multiplies difficulty; it was the reading that keeps "hours × difficulty" (owner decision) intact.

### Ceiling feedback per type
Change 001 asks the ceiling question per type. `day_plan.ceiling_feedback` held one answer per day, so migration 006 adds `ceiling_feedbacks` (JSON, per energy type id) and copies each day's old answer to every type that had a ceiling that day. `PATCH /api/day/:date` takes `ceiling_feedback: {"<id>": answer \| null}` (merged; null clears one). `GET /api/day/:date` returns `plan.ceiling_feedback` as that object.

### `GET /api/day/:date` shape
`spend` and `restore` are replaced by one `totals` list. `readout` lists every type with a ceiling or hours that day.

### Default dashboards
As Change 001 section 6. Today's "today's sessions" is a table of every session today. This month's "counts" are three numbers: tasks closed, sessions logged, days with something in the way. The year's "All energy types — points" is by week (as the change's defaults table says), not by day. Migration 006 soft-deletes the old built-in widgets (rows kept) and adds these; widgets on dashboards you made are kept, with `work_points` renamed and the direction filter dropped.

### Small multiples
Each type's mini chart shows its y-axis labels and its own total in the header. The totals are per series and come from the server (`series[].total`), so the widget never adds types together, including the narrow fallback, where each type becomes its own number. Picking small multiples in the editor splits by energy type when no split is set.

### Session difficulty defaults to the task's
Picking a task in the session form fills in the task's difficulty unless one was set by hand. Opening an existing session leaves it as saved until its task is changed. (The server already used the task's difficulty for points when the session has none.) `GET /api/tasks?brief=1` items gain `difficulty`.

## Dashboard dates, shares and running totals (asked for after Change 001)

### Date picker
A dashboard can run every widget over one day (with day-before and day-after buttons) or a span of dates, instead of each widget's own range. The client sends `GET /api/metrics?widget=:id&from=&to=`; the server swaps the widget's range for those dates. Metrics that ignore ranges (open tasks, stuck work) are unchanged. The choice is not saved; it stays while switching dashboards and resets on reload.

### Shares (pie, share bars)
`share=1` (set by the server for `pie` and `share_bar` widgets) adds `share` to each point: its value as a part of its whole, the group key's total across splits, or with no split every key together. This is a part of the sum of all types, never one type divided by another; values themselves are unchanged and `TestNoMetricNetsEnergyTypes` still holds. Tooltips and the pie's legend show the share and the value.

### Running totals per type
Small multiples can show running totals (`"cumulative": true` in the query, "Running total" in the widget editor), drawn as rising areas. Each type's header shows its total, which is where its line ends.

### Severity scale and the in-force bar
Severity stays a plain number on the server. The form offers a slider from 0 to 5 in half steps (a larger saved value stretches it). Each step has a name and what it roughly feels like, a pain-scale ladder compressed into 0-5: none, very mild (barely noticeable), very low (noticeable), low (distracting sometimes), intermediate (distracting usually), moderate (interrupting), high (hard to ignore), very high (can't ignore), severe (awful), very severe (hard to bear), unbearable. Buffs have their own wording for the same steps. The words are indicative and live in `web/src/states/severity.tsx`.

Each state has a symbol: a ring in its kind's colour, filled clockwise by severity now out of 5. The states in force show as chips (symbol, name, step) along the top of every screen; tapping one opens Buffs & debuffs. The bar is hidden when nothing is in force.

### Difficulty is called Intensity
Everywhere you see it, difficulty is now called **intensity**, so it also fits a game, a workout or a hard conversation. The steps are Light, Moderate, Intense, Very intense and Extreme. Only the words changed: the column, the API field and the points formula still use `difficulty`, and nothing was recalculated.

### Quick capture: titles and areas
- A session's free-text name is labelled **Title** (it was "Label"). An event doesn't show the Task picker; a work session shows it as "Task (optional)".
- A captured session gets only the area the model read from the text, never the last-used or first area, which had put gaming under Day Job. A task still falls back to the last area used, because a task needs one.
- The model may name an area when the text makes it clear (gaming, hobbies, family, chores and health go to a personal area). The spec said not to guess the area.
- The seeded "Energy drain felt" session field is retired (migration 008).
- The model writes a short title ("Video game - Quantum Break", not the whole sentence). For a session, the line as typed goes into the note, so nothing is lost.
- The model sets intensity when the text says how it felt ("it was intense" -> 3, "exhausting" -> 4), and always picks the closest energy type for the activity.
- Some models wrap the answer in another object (`{"name": ..., "value": {...}}`); capture unwraps it. Before this, gpt-oss answers looked empty.
- **One line, several entries.** The section 8 contract is one object per line. The model may now reply with `{"entries": [...]}`, up to 6, when a line describes separate activities ("6 hours at hospital, work was only 1 hour, grandfather's diagnosis took the rest" -> work 1 h + diagnosis 5 h). Each entry is checked like a single one. `POST /api/capture` returns the first entry's fields at the top level, as before, plus `entries` (always at least one). The form shows one card per entry with Task/Session, remove, and "Add entry"; Save writes them one by one, and after a failure only the unsaved ones stay. Every session keeps the typed line as its note.
- `JITTERBUG_LLM_REASONING_EFFORT` (env only, sent only when set) keeps reasoning models such as gpt-oss inside the spec's 5-second timeout, which stays as it is.

### Several energy types in one session
A session can have up to four energy types (migration 009). Each takes a share of the session's hours, in whole percents, and the shares must add up to 100%, so an hour is never counted twice and a day can't pass 24 hours. Each type has its own intensity and earns hours × share × its rate × its intensity, stored when logged and recalculated when an edit changes them (Change 002).
- By energy type, hours and points split the session. Every other total (by day, area, task) is still the whole session. A session counts as its share under each type.
- Filtering sessions by energy type matches any of a session's types.
- Setting one energy type for many sessions at once (bulk) makes them one-type sessions again. A bulk intensity applies to every part.
- Subtypes stay on the session, not on each part. With several types, any of their subtypes can be picked.
- Quick capture may give one activity several types with shares ("studied rust with friends" -> Learning 70%, Leisure 30%). Separate activities are still separate entries.

### Points follow edits (Change 002)
See [`docs/changes/002-points-follow-edits.md`](changes/002-points-follow-edits.md). The edit form shows points read-only. Saving an edit that changes hours, intensity, energy types or shares, or task stores fresh points at today's rates; the bulk bar does the same for energy type, intensity and task. When only a rate has changed, the form says what the session would earn today (`points_now`, derived on read) and offers **Recalculate**; the bulk bar has **Recalculate points**. An edit that sends the same values back recalculates nothing. `PATCH` still takes `points`, which wins over a recalculation.

## Board, table and worklog pass (owner request, 2026-10-31)
- **Table selection and bulk move.** Table rows have tick boxes (a group's header box ticks the group). A floating bar moves the ticked tasks to any status through `POST /api/tasks/move` (`{task_ids, status_id, today}`), one transaction, one transition row per task that changes status; each lands at the end of its new column.
- **Board sorting** (`board_state.sort`): manual, priority, due, intensity, estimate, time in status, newest, oldest. A display order only; the dragged order breaks ties. While sorted, cards still move between columns (landing at the end of the dragged order) but are not reordered within one.
- **Column limits** (`board_state.limits`), per board view: a maximum per status in tasks, points or estimate hours, counted over every card the view shows in that column. A soft limit colours the header; a hard one asks "Move anyway?" before a drag takes the column past it (owner's choice: ask, then allow). Creating a card in a full column does not ask.
- **Hide done after N days** already existed as the filter's `include_done_days`; it is now shown, and changeable, at the foot of each done column, and labelled "Hide done after (days)" in Filter.
- **Priority colours**: a priority with no colour takes one by its rank by weight (blue lowest, green, yellow, orange, red highest); Settings → Priorities can apply these to every priority. Tables can show priority and intensity as symbols only (`card_config.icons_only`).
- **Start and end dates are built-in task fields** (migration 010), editable in the task panel and optional on cards and tables. A move can fill them in (Settings → Task dates): by default start on entering an in-progress status, end on entering done or cancelled, cleared again on reopening. Each can be manual only. The Jira importer now writes `start_date` to the column.
- **`remaining_h`** is a new derived value: estimate minus logged hours, negative once over. Cards, tables and the task panel show a time bar, "3h 2m / 12h · 8h 58m left". The card's separate estimate and logged figures are left out when the bar is shown.
- **Pace to the due date**: derived `days_to_due` (0 = due today, negative = overdue; empty once finished) and `pace_h` (remaining_h ÷ days left, today and the due day both counted). Under the time bar: "≈ 2h 15m a day to finish by Tue", "Due today · 4h to do" or "Overdue 2 days · 3h still to do". A card option ("Hours a day to the due date"), on by default. Days count in the server's time zone.
- **Log time form** reworked as a worklog: Duration (`1h 30m`, `90m`, `1.5`, `1:30`), date logged and start time in one row; Description (stored in `session.label`, now also kept when the session has a task; left as the task's title it is saved empty, so lists still show the task); Task; then Area, energy types with a five-button intensity picker, and subtypes in a Details block; Note opens on demand. No field or stored value was removed.
- **Cycle time in the task panel** is a row of status blocks joined by arrows (To do 3d 3h → In progress 5h · now); the full move list is behind "Show every move".
- **Capture settings** show the endpoint and model actually in use, including ones from `JITTERBUG_LLM_*` (`GET /api/capture/config`); the API key is never sent, only whether one is set.
- **Board look** (asked for "Asana / Monday.com" liveliness on the dark theme): columns carry their status colour as a 3px cap and a tinted count; cards are rounded, lift slightly on hover and show a focus ring; priority, intensity, time in status and due date are tinted chips with text (never colour alone); a coloured edge marks only stalled (red) or overdue (amber) cards; empty columns show a small placeholder with Add task. Toolbar controls that are filtering, sorting or grouping wear the accent tint. Settings → Statuses can recolour statuses by behaviour. Motion is 120 ms fades and a 1 px lift, none with reduced motion.
- **The view fills the space under the buff bar**, so a board's column footers are no longer pushed below the screen.

## Snooze (owner request, 2026-11-01)
- **Snooze hides an open task for some days** without changing its status: `task.snoozed_until` (migration 011), set through `POST /api/tasks/:id/snooze` with `{days, today}`; `days: 0` wakes it. Only tasks in a `todo` or `in_progress` status (Backlog included) can be snoozed; done and cancelled cannot. The longest snooze is the `snooze` setting's `max_days` (Settings → Snooze, default 30).
- **Snoozed tasks are left out of boards, tables and the hidden-status overlays** and listed under a **Snoozed** button beside Backlog and Cancelled in the view toolbar (shown on tables too, since tables hide them). The overlay shows each task's status and the day it comes back, with **Wake now**. The task panel's header has a **Snooze** button: quick picks up to the cap and a day count.
- **Waking is derived**: from the `snoozed_until` date the task is no longer `snoozed` and shows again; nothing runs on a timer. A move into done or cancelled clears the snooze; a move between open statuses keeps it.
- The "Time in status" metric leaves snoozed tasks out (they are parked on purpose, not stuck).

## Board card quick actions (owner request, 2026-11-01)
- **Six actions**: Log time (the worklog form with the task filled in), Snooze (a day count, each with the date the task comes back), Note (edits the task's description in place), Move to (any status), Open task, Delete (after asking).
- **Configurable** in Settings → Card actions (setting `card_actions`, `{rail: [...], menu: [...]}`): which are buttons on the card and which the right-click menu lists. By default the buttons are Log time and Snooze, and the menu lists all six. The card allows up to 3 buttons, so the rail never covers a whole title. More always holds every action that isn't a button. With nothing ticked for right-click, the browser's own menu opens.
- **The rail** shows on hover or keyboard focus, as 26px buttons in a row over the card's upper right corner on the card's hover colour. It takes no space, so the card keeps its size. Snooze shows only on open tasks. On touch screens the rail is just More, always visible, holding every action. Moving from a menu lands the card at the end of its new column and does not ask about column limits.
- **Menus** (right-click, More, Move to, Snooze) share one style: the card's 8px corners, the overlay surface and border, icons, status colour dots, and the dates in muted text. The right-click menu has the card's title as a header.
- **Card size is unchanged.** The mockup's larger card (320px wide, 20px title, 34px chips, 40px buttons) was tried and dropped at the owner's request. Hover brightens the card's surface and border; it no longer lifts the card by 1px.

## Shared control polish (owner request, 2026-11-01)
- **One control style.** Filter dropdowns, date pickers, segmented switches and small buttons are all 24px tall with a 1px outline in the strong border colour, 6px corners and the same padding. Every segmented switch now looks like the board's (outlined track, accent-tinted selected option, hairlines between options). Shared pieces are in `web/src/theme/Toolbar.tsx` (`PageHeader`, `Toolbar`, `ToolbarGroup`, `FilterSelect`) and the CSS in `interactionStyles.ts`. Outlines stay 1px; the faint ones (dashboard switches, default buttons) were given the stronger border colour rather than a thicker line.
- **Whole-pixel layout.** The buff bar was 27.6px tall and the Sessions title 28.8px, which put every control under them on half pixels and blurred their outlines. Both are now whole pixels.
- **Sessions** has the board's header: an 18px title, the date range beside it, and Log time on the right edge. The filters sit in groups that wrap whole (search with Work/Events, energy type and area, then task, intensity and subtypes). A filter that narrows the list wears the accent tint, like the board's, and Clear filters is a text button. The kind filter is now an All / Work / Events switch instead of a dropdown; it sends the same values.
- **Work and Event** use one icon each (tool, cup) everywhere: an equal-width switch in the Log time form and a matched chip in the Sessions table (it used to be plain "work" text next to an "event" tag).
- **Icons**: the sidebar's capture button uses a plus icon centred in the circle (it was a "+" character on the text baseline). Icons are 12px beside text in small buttons and 14px in icon-only buttons and the card rail.
- **Settings tables**: Add <row> starts on the same edge as the rows' controls, and colour swatches are a centred 16px block in a 24px box on every row.

## Duplicate search and complete details (owner request, 2026-11-01)
- **Duplicate search** (`GET /api/tasks/similar?q=`) matches what is typed against every task by words (stems, a prefix for the word still being typed, one typo) and by meaning. The add-task box at the foot of a column, the quick-capture line and its task forms, and a view's search box list the matches under the input, with three small dots while it searches. A match shows its status and why it matched; clicking one opens it (not in quick capture, which has no task panel). Nothing is written.
- **Meaning matching is offline**, at the owner's request: a small sentence model (all-MiniLM-L6-v2, 22M parameters) runs inside JitterBug in pure Go (`internal/embed`), no cgo or extra service. Its output matches onnxruntime's to 1e-7. About 30–50 ms a search on an i5-8500; reading 235 titles takes about 6 s, in the background. The files (90 MB) are downloaded once by an admin in Settings → Duplicate search; until then, and if loading fails, word matching works alone.
- **Ranking**, tuned on 235 real titles: meaning leads (score = max(cos, 0.6·cos + 0.4·words)). Meaning alone matches from 0.5; with the model loaded, shared words count only if the meaning roughly agrees (0.35) or nearly every word matches.
- **Complete details**: Settings → Complete details chooses fields an open task should have (start date, estimate as "max time", intensity, and so on). Each task's `missing` is derived on the server. Views show **Incomplete** beside Backlog, Cancelled and Snoozed, listing the view's open tasks with what each lacks, and the task panel says what is missing. With nothing chosen (the default) there is no Incomplete button.

## Needs review

Gaps where the spec was silent and the most reversible option was taken. Each is small to change.

- **Points formula** (`taskPoints` in `internal/db/derive.go`): `difficulty × priority.weight`. Confirm or give the real formula. (Session points are stored per session from Phase 2: hours × rate × difficulty.)
- **Subtypes ship empty** (section 3 vs section 12). Flip by adding the section 3 list to a new migration's seeds.
- **All seeded statuses are built-in.** Un-builtin any of them with `UPDATE status SET is_builtin = 0 WHERE ...`.
- **Area deletion is refused while tasks remain** (409). Alternative: a reassign dialog like statuses.
- **Sessions have no `updated_at`**, so their edits are last-write-wins. An additive migration can add the column.
- **Capture with unknown intent** leaves Task/Session unselected rather than defaulting to one.
- **Progress bar** is `logged hours / estimate`, capped at 100% (`progress_pct`). The spec names a progress bar without saying of what.
- **Card "subtypes"** shows the distinct subtypes of sessions logged against the task (tasks have no subtypes of their own).
- **"Too low"** only ends a "too high" hold; it does not raise the next suggestion. The spec gives behaviour for "too high" only.
- **Drift** after Change 001: with no spend/restore, Drift needs to know which types make a "low" day. It adds up the hours of the types in `drift_energy_types` (Settings → Reflection, seeded with the old spend types); a low day is under `drift_low_hours` (default 1h) of those; a planned break day is one whose saved ceilings for those types add up to less than that. With no types chosen, the widget asks you to choose. The run counts back from today, today included. Change 001 is silent on Drift.
- **Starting rates** (Change 001, open item 1): every type starts at 1 point per hour.
- **Stuck work** leaves out off-board statuses (Backlog). Filter by status to include them.
- **Band colours**: debuffs use the epic purple, buffs green, modifiers the accent blue. Red was avoided on purpose (no red-means-bad).
- **Column limit totals** (points, estimate hours) are added up in the client from values the server sent, for the header badge only. Move them to the server if a metric ever needs them.
- **Start dates for tasks already in progress** were not backfilled from the transition log; only the Jira import's custom start dates were copied. Moves from now on fill them.
- **Due-date days use the server's time zone.** Right for a server on the person's own machine; a container in UTC can be a day off near midnight. Set `TZ` on the container if that matters.
- **Snoozed "today"** is the server's date when deciding whether a task is still snoozed, and the client's when working out the date it comes back. Same time-zone caveat as due dates.
- **Cancelled tasks cannot be snoozed.** The request said "anything not in Done"; cancelled tasks are already off the board, so snoozing them would hide nothing. Allow it by adding `cancelled` to the check in `Snooze` (`internal/db/snooze.go`).
- **Who counts as incomplete**: only open tasks of type task. Done and cancelled tasks, and epics, are never incomplete. Snoozed tasks are left out of the Incomplete list, as they are out of everything else, until they wake.
- **Duplicate search uses titles only**, not descriptions: long descriptions drown short titles in both word and meaning matching.

