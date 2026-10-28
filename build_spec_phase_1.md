# JitterBug — Phase 1 build spec

Oct 28, 2026 · @Aakash Kumar

## 1. Scope

Self-hosted, single user, one SQLite file. This document is the build contract; anything not written here must be raised, not guessed.

**Phase 1 ships:** tasks, board, table views, areas, sessions, quick capture, transition log, custom fields.

**Tables created, no UI yet:** `day_plan`, `state`.

### Rules

1. Full schema in migration 001. Additive migrations only after first run.
2. Derived values computed on read, never stored.
3. Server is the source of truth.
4. Timestamps are UTC ISO-8601 strings. SQLite has no date type.
5. Soft delete via `deleted_at`.
6. Nothing nets rest against work. No ratio, balance or combined percentage.
7. Lookup tables over enums: statuses, priorities, energy types and subtypes are all user-editable rows.

## 2. Stack

| Layer | Choice |
| --- | --- |
| Backend | Go, `net/http`, `modernc.org/sqlite` (pure Go, no cgo) |
| Database | One SQLite file, WAL mode |
| Frontend | React 18 + TypeScript + Vite |
| Components | Ant Design 5, tuned dense |
| Build | Frontend compiled and embedded via `go:embed` — one binary |
| Drag and drop | `dnd-kit` |

```
bg #09090b   panel #141416   panelDim #0f0f11
border #27272a   borderStrong #3f3f46
fg #fafafa   muted #a1a1aa
accent #60a5fa   warn #fbbf24   danger #fca5a5
```

### Layout

```
cmd/jitterbug/main.go
internal/db/        migrations, queries
internal/api/       handlers
internal/capture/   natural-language parsing
web/                vite app, embedded at build time
jitterbug.db
```

Ant is themed by one `ConfigProvider` token block. Tuned values already exist in `src/antTheme.ts` of the `jitterbug-ui-compare` project: 6px radii, 24–30px controls, no button shadows, `#303036` borders, dense rows.

Palette lives in one file:

## 3. Schema

All of it in migration 001, including tables with no Phase 1 UI.

```sql
-- ---------- lookups, all user-editable ----------

CREATE TABLE status_category (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  behaviour  TEXT NOT NULL CHECK (behaviour IN
               ('todo','in_progress','done','cancelled')),
  is_builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE status (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES status_category(id),
  color       TEXT,
  on_board    INTEGER NOT NULL DEFAULT 1,   -- 0 = reached by button, not a column
  alert_after_days INTEGER,                 -- NULL = never flag as stalled
  is_builtin  INTEGER NOT NULL DEFAULT 0,   -- builtin cannot be deleted
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT
);

CREATE TABLE priority (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT,
  weight     REAL NOT NULL DEFAULT 1.0,     -- multiplier in points
  position   INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

-- Engineering, Physical, Admin, Rest, Leisure ... extensible.
-- direction is what the no-netting rule keys off.
CREATE TABLE energy_type (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  direction  TEXT NOT NULL CHECK (direction IN ('spend','restore')),
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE subtype (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  energy_type_id INTEGER NOT NULL REFERENCES energy_type(id),
  position       INTEGER NOT NULL DEFAULT 0,
  deleted_at     TEXT,
  UNIQUE (energy_type_id, name)
);

CREATE TABLE area (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL UNIQUE,
  key_prefix             TEXT NOT NULL UNIQUE,   -- OM2, PER, FRL
  color                  TEXT,
  default_energy_type_id INTEGER REFERENCES energy_type(id),
  position               INTEGER NOT NULL DEFAULT 0,
  deleted_at             TEXT
);

-- ---------- core ----------

CREATE TABLE task (
  id             INTEGER PRIMARY KEY,
  key            TEXT NOT NULL UNIQUE,     -- PER-1; shown only in the task panel
  title          TEXT NOT NULL,
  description    TEXT,
  area_id        INTEGER NOT NULL REFERENCES area(id),
  status_id      INTEGER NOT NULL REFERENCES status(id),
  priority_id    INTEGER REFERENCES priority(id),
  energy_type_id INTEGER REFERENCES energy_type(id),  -- seeded from the area
  difficulty     INTEGER,                  -- 1,2,4,8,16
  estimate_h     REAL,
  due_at         TEXT,
  board_pos      REAL NOT NULL DEFAULT 0,  -- fractional, midpoint insertion
  custom         TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX task_board ON task(status_id, board_pos) WHERE deleted_at IS NULL;
CREATE INDEX task_area  ON task(area_id)              WHERE deleted_at IS NULL;

-- Append-only. Source of truth for every date in section 4.
CREATE TABLE status_transition (
  id             INTEGER PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES task(id),
  from_status_id INTEGER REFERENCES status(id),   -- NULL on creation
  to_status_id   INTEGER NOT NULL REFERENCES status(id),
  reason         TEXT,                            -- 'user' | 'status_deleted'
  at             TEXT NOT NULL
);
CREATE INDEX trans_task ON status_transition(task_id, at);

CREATE TABLE session (
  id             INTEGER PRIMARY KEY,
  task_id        INTEGER REFERENCES task(id),
  label          TEXT,                     -- used when task_id IS NULL
  area_id        INTEGER REFERENCES area(id),
  kind           TEXT NOT NULL CHECK (kind IN ('task','event')),
  energy_type_id INTEGER NOT NULL REFERENCES energy_type(id),
  hours          REAL NOT NULL,
  difficulty     INTEGER,
  started_at     TEXT,                      -- optional
  logged_for     TEXT NOT NULL,             -- local date YYYY-MM-DD
  note           TEXT,
  custom         TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX session_day ON session(logged_for) WHERE deleted_at IS NULL;

CREATE TABLE session_subtype (
  session_id INTEGER NOT NULL REFERENCES session(id),
  subtype_id INTEGER NOT NULL REFERENCES subtype(id),
  rank       INTEGER NOT NULL,              -- 1..4 -> 100/50/25/25 %
  PRIMARY KEY (session_id, rank)
);

-- ---------- no Phase 1 UI ----------

CREATE TABLE day_plan (
  day          TEXT PRIMARY KEY,
  focus        TEXT NOT NULL DEFAULT '[]',  -- JSON array of area names
  ceilings     TEXT NOT NULL DEFAULT '{}',  -- JSON {energy_type_id: number}
  locked_at    TEXT,
  note         TEXT
);

CREATE TABLE state (                        -- buffs, debuffs, modifiers
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('buff','debuff','modifier')),
  severity      REAL NOT NULL DEFAULT 1,    -- severity at day 0
  started_on    TEXT NOT NULL,
  duration_days INTEGER,                    -- NULL = open ended
  decay         TEXT NOT NULL DEFAULT 'static'
                  CHECK (decay IN ('static','linear','fast','slow')),
  cleared_on    TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX state_open ON state(cleared_on);

-- ---------- config ----------

CREATE TABLE view (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  layout      TEXT NOT NULL CHECK (layout IN ('board','table')),
  filter      TEXT NOT NULL DEFAULT '{}',
  card_config TEXT NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT
);

CREATE TABLE custom_field (
  id       INTEGER PRIMARY KEY,
  entity   TEXT NOT NULL CHECK (entity IN ('task','session')),
  key      TEXT NOT NULL,                   -- immutable once created
  label    TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN
             ('text','int','real','date','bool','select')),
  options  TEXT,                            -- JSON array, select only
  position INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  UNIQUE (entity, key)
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- JSON
);
```

### Seeds

| Table | Rows |
| --- | --- |
| `status_category` | To do → `todo` · In progress → `in_progress` · Done → `done` · Cancelled → `cancelled` (all builtin) |
| `status` | Backlog (`on_board 0`) · To do · In progress · Done · Cancelled (`on_board 0`) |
| `priority` | Low 0.75 · Normal 1.0 · High 1.5 (all builtin) |
| `energy_type` | Engineering, Physical, Admin → `spend` · Rest, Leisure → `restore` |
| `subtype` | Engineering: coding, vibe coding, documentation, debugging · Physical: cardio, strength · Admin: errands, paperwork · Rest: sleep, nap · Leisure: gaming, reading, social |
| `area` | none — first run asks for one |

`board_pos` is REAL: dropping between two cards takes the midpoint. Renormalise the column only when two neighbours come within 1e-6.

## 4. Dates and the transition log

Every status change writes a `status_transition` row. Append-only — never updated or deleted. The move and the row go in one SQL transaction.

No date is stored on the task. All of them derive:

| Field | Derivation |
| --- | --- |
| Created age | now − `task.created_at` |
| Started age | now − first transition into a `in_progress` category |
| First started | earliest transition into `in_progress` |
| Last started | latest transition into `in_progress` |
| Completed | latest transition into `done`; NULL if it moved back out |
| Cancelled | latest transition into `cancelled` |
| Time in status | now − latest transition |

All three ages are available and mean different things: **created age** is how long it has existed, **started age** how long since work began, **time in status** how long it has sat where it is. Cards and tables choose per view (section 7).

```sql
CREATE VIEW task_dates AS
SELECT t.id,
  (SELECT MIN(tr.at) FROM status_transition tr
     JOIN status s ON s.id = tr.to_status_id
     JOIN status_category c ON c.id = s.category_id
    WHERE tr.task_id = t.id AND c.behaviour = 'in_progress') AS first_started_at,
  (SELECT MAX(tr.at) FROM status_transition tr
    WHERE tr.task_id = t.id)                                 AS last_moved_at
FROM task t;
```

If a task leaves `done`, Completed returns to NULL and it re-enters the open set. No special case needed.

### Cycle time chart

Per task, a horizontal bar split by status, each segment's width proportional to time spent there. Stacked across tasks it shows where work waits. Build it in Phase 1 — it is the test that the transition log is correct.

## 5. Custom fields

No schema changes, ever. One JSON column per entity plus a definition table so the UI knows how to render each key.

**Storage** — `task.custom`, `session.custom`:

```json
{ "review_due": "2026-11-04", "escalated": true }
```

**Definitions** — `custom_field`: `entity`, `key` (immutable), `label`, `type` (text / int / real / date / bool / select), `options` for select.

### Querying

SQLite's JSON functions keep custom fields filterable, sortable and indexable:

```sql
SELECT * FROM task
 WHERE json_extract(custom, '$.escalated') = 1
 ORDER BY json_extract(custom, '$.review_due');

CREATE INDEX task_review_due ON task (json_extract(custom, '$.review_due'));
```

### Rules

- Deleting a definition soft-deletes it; the JSON data stays.
- `type` cannot change. Create a new field instead.
- Values validated against the definition on write; a `date` field rejects anything not `YYYY-MM-DD`.
- Unknown keys with no definition are kept and ignored. Never strip unrecognised data.

### Presets

Blocked reason (text) · Review due (date) · Energy drain felt (select: lighter than expected / as expected / heavier). Ordinary rows, nothing special in code.

## 6. Statuses, priorities, areas

### Statuses

Rows, not an enum. Each has a colour, a position and a category. **Code branches on `status_category.behaviour`, never on a name.** Categories are themselves rows, so more can be added later; each must map to one of the four behaviours.

Statuses are addable and renamable. Built-in ones cannot be deleted.

**Deleting a status** opens a dialog: pick the status its tasks move to. On confirm, for each affected task — update `status_id`, write a `status_transition` row with `reason = 'status_deleted'` and `at` = now, bump `updated_at`. So the move is in the history like any other, and time-in-status restarts. Deleting a status with no tasks skips the dialog.

### The hidden backlog

Backlog is **not a column**. It is a status with `on_board = 0`.

- The board renders only `on_board = 1` statuses.
- A **Backlog** button in the board header, with a count, opens a table overlay. Escape closes it; it is not a route.
- Moving an item out of the overlay sets it to the first `on_board` status in the `todo` category.

Same treatment for Cancelled. Any status can be hidden this way — nothing about Backlog is special in code.

### Priorities

Rows too, with colour and a `weight` used in points. Seeded Low 0.75 / Normal 1.0 / High 1.5; more can be added, built-ins cannot be deleted. Weight is centred on 1.0 so an unset priority distorts nothing.

Deletion follows the status pattern: pick a replacement, or clear it.

### Areas

A **column on the task**, not a tag. Exactly one, required.

- Carries the key prefix: `PER-1`, `OM2-114`. Numbering is per area.
- Carries `default_energy_type_id`. A new task in Personal gets that area's default energy type; changeable in the task panel.
- Creating a task from a board column inherits the area from the active view. If the view spans several areas, the composer shows a picker with the most recent preselected.
- Changing a task's area does not change its key. Keys are permanent.

### Energy type resolution

| Case | Energy type |
| --- | --- |
| Session with a task | inherited from the task |
| Session without a task | from the area default, else asked |
| Task | area default at creation, editable in the task panel |

Always overridable at the point of entry; the chain only sets what is preselected.

### Buff and debuff decay

Phase 2 UI, specified here because the schema carries it. The user enters a state manually with a severity, an optional duration and a decay shape. Effective severity on a given day is `severity × f(t)` where `t = days since started_on / duration_days`.

| `decay` | f(t) | Shape |
| --- | --- | --- |
| `static` | 1 | Holds until cleared. Default |
| `linear` | 1 − t | Even fade |
| `fast` | e^(−3t) | Steep early recovery, long tail — a hepatitis-A curve |
| `slow` | 1 − t² | Lingers, then drops away |

With `duration_days` NULL, decay is ignored and the state holds at full severity until cleared by hand.

**Reaching zero does not clear the state.** It stays listed, at zero, until the user clears it. A fever set for 7 days that is still there on day 12 must not quietly disappear.

Effective severity is computed on read, never written back.

## 7. Views and card configuration

### Filter

```json
{
  "areas": [1],
  "statuses": null,
  "difficulty_min": null,
  "custom": { "escalated": true },
  "include_done_days": 7
}
```

`null` means no constraint. `include_done_days` keeps the Done column from growing without limit — only items finished within N days show.

A view may span several areas, so "Everything" is just a view with `areas: null`. The combined table you wanted is a view with `layout: "table"` and no area filter.

### Built-in views on first run

One per area, plus **Everything** (table, all areas) and **Stuck** (table, open items sorted by time in status). All editable, all deletable.

| Rank | Weight |
| --- | --- |
| 1 | 100% |
| 2 | 50% |
| 3 | 25% |
| 4 | 25% |

"Main job", "Personal", "Freelance" are **saved views**, not filter chips: a filter plus a layout plus a card configuration.

### Card configuration

Per view, so the same task can be dense in one and detailed in another:

```json
{
  "show": {
    "area": false, "status": false,
    "created_age": false, "started_age": false, "time_in_status": true,
    "difficulty": true, "priority": true, "energy_type": false,
    "subtypes": true, "estimate": true, "progress_bar": true,
    "due": false, "custom": ["review_due"]
  },
  "density": "compact"
}
```

Settings UI is a toggle list with a live card preview. `custom` is an allow-list, not a boolean.

**The task key is never shown on cards or in tables** — only in the task panel. It is an identifier for linking and search, not board furniture.

### Table layout

Same view with `layout: "table"`: Ant `Table`, same filter, columns from the same `show` config. Default sort is time-in-status descending — the aging list.

### Subtype weights

`session_subtype.rank` → weight: 1 = 100%, 2 = 50%, 3 = 25%, 4 = 25%. Stored in `setting` under `subtype_weights`, tunable without a migration. The user ranks by dragging; percentages are never typed.

## 8. Quick capture

Round button, bottom right, on every screen, plus a global shortcut. One typed or dictated line becomes a task or a session.

**Highest-risk screen in the product.** If capture takes more than a few seconds the data stops arriving and every other view goes empty.

### What it must distinguish

| Input | Result |
| --- | --- |
| "Worked on stm32 demo, 2 hours" | session · `task` · Engineering · 2h |
| "Played video games with my cousin" | session · `event` · Leisure |
| "Cleaned my devices" | session · `task` · Admin |
| "Need to order a replacement NVR drive" | **task** · To do |

Past tense → session. Future or imperative → task.

**Events** are things that happened but are not work: a bath, a meal, a nap, time with people. They are sessions with `kind = 'event'` and no `task_id`. The user may attach one to a task by hand afterwards; capture never does.

### Confirm before writing

The parse returns a filled form, not a saved row. Everything editable, focus on Save, Enter saves, Escape cancels. Never write straight from the parse.

### Contract

```json
{
  "intent": "session" | "task",
  "kind": "task" | "event",
  "title": "string",
  "energy_type": "Engineering",
  "hours": 2.0,
  "difficulty": 4,
  "subtypes": ["coding"],
  "area": "Main job",
  "matched_task_key": "OM2-114",
  "confidence": 0.8
}
```

Any field may be null; nulls are left blank in the form, not guessed. If `matched_task_key` resolves, energy type comes from that task and the parsed value is ignored.

**Task matching happens in SQLite, not in the model.** FTS or LIKE over open task titles; the top candidates go into the prompt so the model picks among real tasks instead of inventing a key.

### Provider

One interface, configurable endpoint and model name in `setting`. Any OpenAI-compatible API satisfies it, local or hosted.

**It must degrade.** If the endpoint is unset, down or slow, capture falls back to the manual form with the raw text in the title. Capture never fails because an LLM was unavailable — that would put the product's most important path behind its least reliable dependency.

Timeout at 5 seconds, then fall back.

### Audit

Store the raw input and the parse in `session.custom` under `_capture`. When the parser is wrong you need to see what it was given, and later it becomes a test corpus.

## 9. Sync and offline

| State | Behaviour |
| --- | --- |
| Online | Everything works |
| Offline | Last loaded data stays on screen, read-only. A banner says so. Actions disabled, not hidden |
| Reconnect | Refetch and re-enable. No queued writes |

Server-authoritative, online-only for writes — the Jira model.

Actions are **disabled, not hidden**, when offline. A greyed button with a tooltip explains itself; a vanished one reads as a bug.

### Concurrency

Two tabs is normal even single-user. Writes send the `updated_at` they last saw; the server returns 409 plus the current row if it has moved. Client refetches and reapplies.

Board drags are exempt — `board_pos` is last-write-wins.

### Deferred

Offline writes need a queue, conflict resolution and a reconciliation UI — more work than the rest of Phase 1. If added later, the shape is an append-only operation log with last-write-wins per field, which this schema already suits.

**Capture buffering is the one worth adding first:** quick capture to `localStorage` when offline, flushed on reconnect. A thought you cannot write down is lost. Not Phase 1, but design nothing that blocks it.

## 10. API

JSON over HTTP, no auth in Phase 1 — it binds to the homelab network. Add auth before it ever faces the internet.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/bootstrap` | areas, statuses, categories, priorities, energy types, subtypes, views, custom fields, settings |
| GET | `/api/tasks?view=:id` | view filter resolves server-side |
| POST | `/api/tasks` | returns the task with its assigned key |
| PATCH | `/api/tasks/:id` | optimistic concurrency on `updated_at` |
| POST | `/api/tasks/:id/move` | `{status_id, before_id, after_id}` — writes the transition atomically |
| DELETE | `/api/tasks/:id` | soft delete |
| GET | `/api/tasks/:id/transitions` | cycle-time chart |
| GET POST | `/api/sessions` |  |
| PATCH DELETE | `/api/sessions/:id` |  |
| POST | `/api/capture` | `{text}` → the section 8 contract. Parses only, writes nothing |
| DELETE | `/api/statuses/:id` | requires `?reassign_to=:id` when tasks are linked |
| CRUD | `/api/views` `/api/areas` `/api/statuses` `/api/status-categories` `/api/priorities` `/api/energy-types` `/api/subtypes` `/api/custom-fields` `/api/states` |  |
| GET | `/api/day/:date` | plan plus totals. Phase 2 UI, endpoint now |

### Rules

- **Move is its own endpoint.** Status change and transition row must be one atomic operation; a generic PATCH makes that easy to get wrong.
- **Filters resolve on the server.** The client sends a view id, not a query. Otherwise filter logic ends up in two places and drifts.
- **Errors are `{error, detail}`** with real HTTP codes. 409 carries the current row.
- **Derived fields are computed and returned** — `time_in_status_h`, `first_started_at`, `points` — never stored, never computed client-side. One implementation, server-side.

## 11. Build order

One vertical slice at a time, each working end to end before the next starts. Do not generate the whole app in one pass.

| # | Step | Done when |
| --- | --- | --- |
| 1 | Migration 001 + seeds | DB opens, seeds present, migration idempotent |
| 2 | Bootstrap + task CRUD + key assignment | Create via curl, get `PER-1`, next is `PER-2` |
| 3 | Transitions + move endpoint + derived dates | Move forward, back, forward — first-started stays first |
| 4 | Board UI, Ant tuned, dnd-kit | Drag persists across reload; backlog is not a column; no keys on cards |
| 5 | Backlog overlay + area picker on create | Escape closes; a task made in Personal is area Personal with its default energy type |
| 6 | Views: filter, card config, table layout | Toggling a field changes that view only |
| 7 | Lookup admin: statuses, priorities, energy types, subtypes | Deleting a status reassigns its tasks and writes transitions |
| 8 | Sessions + manual log form | Log 2.5h against a task; energy type inherited |
| 9 | Quick capture, manual path | Confirm form works with the provider off |
| 10 | Capture, LLM path | The four examples parse; 5s timeout falls back cleanly |
| 11 | Custom fields: defs, editors, allow-list | Add a date field, set it, filter by it |
| 12 | Cycle-time chart | Segments match the transition log by hand-check |

### Testing

Tests go on the arithmetic and the derivations, not the UI:

- Key assignment under concurrent inserts
- Date derivation across forward, backward and reopened paths
- `board_pos` midpoint insertion and the renormalise threshold
- Points, priority weight, subtype rank weighting
- Status deletion: every affected task reassigned, one transition each
- Custom field validation per type
- State decay curves at t=0, mid, and past duration

Silent wrongness in any of these corrupts the record this tool exists to keep. The UI can be eyeballed.

### Keep it readable

This runs for years with you as the only maintainer. Prefer boring, obvious code over clever. If a file passes \~400 lines, split it. You will be debugging this at some point when you have no energy for it — write for that version of yourself.

## 12. Still open

### Settled this round

| Question | Answer |
| --- | --- |
| Key numbering | Per area. `PER-1`, `PER-2` |
| Session start time | Optional. Hours are enough |
| Energy types | A table, not two values. Engineering, Physical, Admin, Rest, Leisure, extensible. `direction` carries the spend/restore split |
| Subtypes | Belong to an energy type. Engineering → coding, documentation. Physical → cardio, strength |
| Priorities | A table, not three values. Weight centred on 1.0 |
| Symptom linkage | Dropped. The user enters a debuff by hand with a decay curve (section 6) |
| Task key visibility | Task panel only |

### The stalled-work flag

You asked what `alert_after_days` is for. It turns a status red once a task has sat in it too long — so a thing that has stopped moving is visible at a glance rather than discovered at day 23.

It is per status because thresholds differ: three days in In progress is normal, three weeks in Blocked is not. Default NULL means nothing is ever flagged, so it stays off until you set one. Drop the column if you don't want the feature; nothing else depends on it.

### Deferred, not open

| Item | Decision |
| --- | --- |
| Subtype seed list | Seeded later. Phase 1 ships the table empty and the admin UI; the user adds their own on first run |
| `event` sessions on tasks | Allowed. Attached by hand in the task panel or session editor. Capture never sets it — it leaves `task_id` null for events |
| Status categories beyond the four | Configurable later. Phase 1 exposes no UI for adding categories; the table already supports it |

None of these need a schema change when they land.

### Not in this document

Timer, day readout, reflection views, buffs UI. Tables and endpoints exist; behaviour is in the design notes.

One rule from those notes that an implementer may try to "helpfully" break: **nothing nets rest against work.** No ratio, no balance, no combined percentage. A view that seems to need one is a wrong view.

## 13. Working agreement

Standing rules for whoever builds this — human or agent. These outlive any single session.

### Files the repo must carry

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Read-first for any agent. Points at this spec, names the stack, how to build, run and test |
| `docs/decisions.md` | Append-only. One entry per non-obvious choice: date, what, why, what was rejected |
| `docs/schema.md` | Every table with a line on what it is for. Updated with each migration |
| `docs/deviations.md` | Where the code differs from this spec, and why |
| `README.md` | Build, run, back up, restore |

`deviations.md` is the one that matters. Divergence is certain; the only question is whether it is written down or discovered a year later.

### Source of truth

- **This doc** is authoritative on *what* and *why*.
- **The repo** is authoritative on *what was actually built*.
- When they disagree, append to `docs/deviations.md` and say so in the handoff.

**An agent cannot edit this doc.** Never assume it has been updated to match the code. Anything learned during the build goes in the repo's docs, and the owner folds it back here.

### Code

- Boring over clever. This runs for years with one maintainer.
- Split files by feature, not by layer. If one passes roughly 400 lines, split it.
- No ORM or query-builder abstraction over SQL. Queries stay queries.
- Every derived value has exactly one implementation, server-side.
- **Use the spec's vocabulary**: area, session, subtype, energy type, state, transition. Not category, entry, tag, mood, event-log. Drifting names make the doc useless as a reference.

### Portability

- Pure Go, no cgo. `modernc.org/sqlite` is chosen for this reason — do not swap it for `mattn/go-sqlite3`.
- No absolute paths anywhere. DB path, port and LLM endpoint come from env vars with working defaults.
- Must run both bare and in a container. Test both before calling a step done.
- **No startup dependency on any external service.** A missing or dead LLM endpoint degrades capture to the manual form; it never prevents the app starting.
- Lockfiles committed. The frontend must build from a clean checkout with no network beyond the registry.

### Commits

- One commit per step in section 11.
- Message says what changed and why.
- Never mix a refactor with a feature.
- Do not reformat files you did not otherwise change.

### When the spec is silent

Stop and ask. Do not fill the gap quietly — that is how a tool ends up with behaviour nobody chose.

If you are working unattended and genuinely blocked: take the most reversible option, build the smallest version of it, and write it in `docs/deviations.md` under a **Needs review** heading.

### Before any step counts as done

1. The acceptance criterion in section 11 was actually run, not assumed.
2. Tests on the arithmetic pass.
3. Docs updated if the schema or behaviour changed.
4. The app starts from an empty database and from an existing one.
5. A human can read the diff and tell what it does.
