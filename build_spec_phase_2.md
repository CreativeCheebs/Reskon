# JitterBug — Phase 2 build spec

Oct 30, 2026 · @Aakash Kumar

## 1. Scope

Phase 2 is the **looking-at-yourself** half. Phase 1 collects; Phase 2 shows.

**Ships:**

- A configurable dashboard with draggable, resizable widgets
- The day screen: morning plan and evening readout
- Buffs and debuffs management
- Every reflection view from the design notes, as widgets

**Not here:** the timer. It runs in parallel on its own PRD and shares only `/api/sessions`.

### Depends on

Phase 1 complete: `session`, `session_subtype`, `task`, `status_transition`, `area`, `energy_type`, `day_plan`, `state`. The last two have tables already and get their UI here.

### Rules carried over

1. Derived values computed on read, never stored. **One exception:** a session's points are stored on the session when it is logged (section 6).
2. Additive migrations only.
3. **Nothing nets rest against work.** In Phase 2 this stops being a style note and becomes a validation rule — see section 4.
4. No targets, no streaks, no grades. Counts and facts.

### One honest caveat

Several widget defaults here — thresholds, groupings, which subtypes matter — are guesses until a few weeks of real logs exist. They are written as **settings with defaults**, not constants, so tuning them later is a config change rather than a rebuild.

## 2. Grafana, or build it

**Decision: build it in-app.** Grafana is the wrong shape for this, and the reasons are concrete rather than aesthetic.

### What embedding Grafana actually costs

It needs `allow_embedding = true` to drop the `X-Frame-Options: deny` header, and a reverse proxy or CDN can silently put that header back. Private dashboards show a **login screen inside the iframe** unless auth is handled; browsers restrict third-party cookies, so sessions break across domains unless `cookie_samesite = lax` and both are served from the same domain. The workarounds each cost something: anonymous access removes access control, a service-account token in the iframe URL is visible in dev tools and reusable by anyone with the link, and the recommended option is a backend proxy that injects credentials.

Theming is limited to URL parameters — `theme`, `kiosk`, `refresh`, time range, variables. Anything deeper means pulling data through the API and building your own charts, which is the thing Grafana was supposed to save you.

Auth and token failures tend to surface as **broken panels rather than clear errors**.

### And the shape is wrong anyway

| Grafana assumes | JitterBug is |
| --- | --- |
| Time-series metrics, usually Prometheus | Relational rows in SQLite (a third-party plugin) |
| Operational monitoring, alerting | Personal reflection, deliberately no alerts |
| A separate service to run and update | One binary |
| Dashboards as the product | Dashboards as one screen among several |

It also brings exactly what the design notes rule out: thresholds, alert states, and the red-means-bad framing. You would spend the project turning those off.

### What to build instead

| Layer | Choice |
| --- | --- |
| Grid | **react-grid-layout** — drag, resize, responsive breakpoints |
| Charts | **Recharts** for standard charts; plain divs for bands and bars |
| Data | One **metrics API** (section 4) |
| Persistence | `dashboard` and `widget` tables (section 8) |

react-grid-layout is the de facto choice for this and is what Grafana's own dashboard grid was built on. A team that evaluated it against the alternatives found **dnd-kit** has no built-in grid or resizing (both would be custom), **Packery** was last majorly updated in 2018 with limited React and TypeScript support, and **Gridster.js** has minimal React support and known bugs. They chose react-grid-layout for its built-in drag-and-drop, React integration, active maintenance, and grid support.

Its stated limits: little flexibility for non-grid layouts, and possible performance strain on very complex data-heavy dashboards. Neither applies at this size.

### Honest counterpoint

If you later want alerting, multi-source correlation, or dashboards shared with other people, Grafana wins and this decision should be revisited. For a single-user reflection tool on your own LAN, it is a second service to run, update and back up in exchange for panels you will spend time fighting.

## 3. Dashboard architecture

### The widget contract

Every widget is the same thing: **a metric query plus a visualisation**. No widget has bespoke data-fetching code.

```json
{
  "id": 12,
  "title": "Personal hours per day",
  "viz": "bar",
  "query": {
    "metric": "session_hours",
    "group": "day",
    "range": "30d",
    "filters": { "area": "Personal" },
    "split": null
  },
  "options": { "show_axis": true, "color": "accent" }
}
```

Adding a widget type means adding a `viz` renderer. Adding a new thing to measure means adding a metric (section 4). The two are independent, which is what stops this becoming twenty bespoke components.

### Visualisations

| `viz` | Use | Built with |
| --- | --- | --- |
| `bar` | A value per day or week | Recharts |
| `line` | A trend | Recharts |
| `cumulative` | Only ever rises — the confidence view | Recharts area |
| `number` | One big figure plus a label | Plain markup |
| `list` | Named events, e.g. days over plan | Plain markup |
| `bands` | Buffs and debuffs across days | Plain divs, not a chart |
| `split_bar` | One bar per day, split by subtype or area | Recharts stacked |
| `table` | Rows | Ant `Table` |

`bands` is deliberately hand-built: a chart library makes a span-across-days lane harder, not easier.

### Grid

react-grid-layout, 12 columns, 40px row height, 8px margin.

- **Edit mode is a toggle.** Default is view-only, so a widget cannot be dragged by accident while reading.
- Widgets resize from the bottom-right only. Free-floating overlap is off; the grid compacts vertically.
- Position saves on drop, not continuously.
- Each widget fetches on mount and has a refresh button. No polling.

### Mobile

A drag grid on a phone is bad, so don't ship one.

- Under 768px: the same widgets, single column, **in saved order, no editing**.
- Each widget declares a `min_width_px`; anything below it renders as its `number` fallback instead of a squashed chart.
- No edit mode at all on mobile.

### Multiple dashboards

A dashboard is a row with a name. Ship three defaults: **Today**, **This month**, **The year**. All editable, all deletable, and a new empty one can be created.

This is what makes the thing extensible without more product decisions — "hours of personal tasks per week" is a widget you add, not a feature anyone builds.

## 4. The metrics API

One endpoint, not twenty. This is the piece that decides whether Phase 2 stays maintainable.

```
GET /api/metrics?metric=session_hours&group=day&range=30d&filters[area]=Personal
```

```json
{
  "metric": "session_hours",
  "unit": "hours",
  "direction": "spend",
  "points": [
    { "key": "2026-10-01", "value": 2.5 },
    { "key": "2026-10-02", "value": 0 }
  ]
}
```

### The registry

Metrics are a server-side registry, not free SQL. Each declares its unit, direction, allowed groupings and allowed filters.

| Metric | Unit | Direction | Groups by |
| --- | --- | --- | --- |
| `session_hours` | hours | from energy type | day, week, month, area, subtype, energy\_type |
| `work_points` | points | spend | day, week, month, area, subtype |
| `session_count` | count | — | day, week, area, subtype |
| `tasks_closed` | count | — | day, week, month, area |
| `tasks_open` | count | — | status, area |
| `time_in_status` | hours | — | task, status |
| `cycle_time` | hours | — | task, status |
| `state_days` | days | — | day, kind, name |
| `days_over_plan` | list | — | day |
| `ceiling_vs_actual` | ratio | — | day, energy\_type |

Filters available everywhere: `area`, `energy_type`, `subtype`, `status`, `kind`, `task_id`.

Ranges: `7d`, `30d`, `90d`, `1y`, `all`, or explicit `from`/`to`.

`week` grouping starts on the day set in settings (default Monday).

Adding a metric is one registry entry plus one query. No new endpoint, no new widget code.

### Where the no-netting rule lives

**A single query may not mix directions.** `GET /api/metrics?metric=session_hours&split=energy_type` returns Engineering, Physical, Rest and Leisure on one axis — and the server **rejects it with 400** if the split spans both `spend` and `restore`.

To see both, use two widgets. They sit side by side and are never summed, netted or expressed as a ratio.

There is also no `balance`, `net_energy` or `productivity_rate` metric, and none may be added. A ratio of work to rest is a statement about a person's worth, and this tool does not make one.

### Performance

Every metric is a `GROUP BY` over tens of thousands of rows at most. No caching, no materialised views, no pre-aggregation. Add an index when a query gets slow, and not before.

## 5. Widget catalogue

Every one is config over the section 4 API. None needs its own backend.

### Time and effort

| Widget | viz | metric · group · filters |
| --- | --- | --- |
| Personal hours per day | `bar` | `session_hours` · day · area=Personal |
| Hours per week by area | `split_bar` | `session_hours` · week · split=area |
| Work points per day | `bar` | `work_points` · day |
| Work points, cumulative | `cumulative` | `work_points` · day · range=1y |
| Hours by subtype this month | `split_bar` | `session_hours` · month · split=subtype |
| Engineering vs admin | `line` | `session_hours` · week · filter energy\_type in (Engineering, Admin) |

### Rest

Separate widgets by rule, never combined with the above.

| Widget | viz | metric |
| --- | --- | --- |
| Rest hours per day | `bar` | `session_hours` · day · direction=restore |
| Sleep vs leisure | `split_bar` | `session_hours` · day · split=energy\_type, restore only |

### Conditions

| Widget | viz | metric |
| --- | --- | --- |
| Day conditions | `bands` | `state_days` · day · range=30d |
| Days with something in the way | `number` | `state_days` · count · range=30d |

The `bands` widget is the one from the design notes: debuffs as continuous spans across the days they cover, sitting directly above a points widget so a flat week reads as *migraine week* rather than failure.

**It is placed above, never merged.** No shading of the points chart, no multiplier, no correlation line.

### Tasks

| Widget | viz | metric |
| --- | --- | --- |
| Stuck work | `table` | `time_in_status` · open tasks, sorted desc |
| Tasks closed per week | `bar` | `tasks_closed` · week |
| Where work waits | `split_bar` | `cycle_time` · split=status |
| Open by status | `number` ×n | `tasks_open` · status |

### Reflection

| Widget | viz | Notes |
| --- | --- | --- |
| Days over plan | `list` | Named dates with what happened. No count-up framing |
| Counts this month | `number` ×n | Tasks closed, heavy ones, gym sessions, rest days |
| Drift | `number` | "Day 7 of a 2-day break." Elapsed as fact, no nudge |

**Drift** is the retrospective time-blindness widget. It compares the current run of low-work days against the intent recorded in `day_plan` and states the count. No encouragement, no warning colour, no suggestion.

Until `day_plan` has rows to compare against, the widget renders greyed out with a short "needs a morning plan" note instead of a number.

### Defaults

| Dashboard | Widgets |
| --- | --- |
| **Today** | Ceiling vs actual, today's sessions, active states, stuck work |
| **This month** | Points per day, conditions band, counts, days over plan, hours by subtype |
| **The year** | Cumulative points, tasks closed per week, rest days per month |

## 6. The day screen

Not a dashboard. A fixed two-panel screen, because its job is the same every day.

### Morning: plan

Three things, all optional, all carried forward from yesterday so most mornings are one tap or none.

1. **Focus** — which areas today is for. Chips, multi-select.
2. **Ceilings** — one number per spend-direction energy type. Set with +/−, not a slider. Suggests yesterday's value.
3. **In force** — active buffs and debuffs, **shown not entered**.

The third is the one that changes behaviour. Seeing *flare-up, day 4* before committing is what stops the self-contract breach, which is the whole reason this screen exists.

### Ceiling adjustment

The app suggests; the user decides. At the bottom of the evening readout, one question: was today's ceiling about right, too high, or too low? It can be answered any time and changed later. Answering it does not close or freeze the day.

"Too high" drops the suggestion by \~20% and holds it there for three days before creeping back. Holding a lower number is the default behaviour, not a setback — copy and colour must not imply otherwise.

### Evening: readout

Per energy type: **planned ceiling, actual spent**. Rest shown alongside, by kind, never netted.

```
SPEND      Engineering  planned 10  ·  spent 11  ⚠
           Physical     planned  5  ·  spent  2

RESTORE    Sleep        6.5h
           Leisure      2.5h

IN FORCE   Unwell (2), day 1
```

The warning fires **only** on overspending your own plan. It is an indicator, not an instruction — seeing "11 of 10" in the afternoon is the useful moment, because you can still choose to stop or deliberately continue.

### No day locking

Days are never locked. Any day can be edited at any time, with no unlock step and no "edited" marker.

### Points are stored per session

Each session saves its points when it is logged, alongside its hours. Every metric reads the stored value.

- **Changing a rate or formula** applies silently to sessions logged from then on. Past sessions keep their points, so history never shifts.
- **Editing an old session** never recalculates its points. Hours and points are both stored, and either can be edited by hand.
- **Existing sessions** are backfilled once, at the rates in force when migration 002 runs.

### Day label — deferred

The rest day / normal / heavy label needs thresholds, and there is no data to set them from yet. Not in Phase 2. Revisit once a few weeks of `day_plan` and session data exist.

## 7. Buffs and debuffs

The table exists from Phase 1. This is its screen.

### The list

Columns: name, kind, severity now, started, days running, decay shape, clear.

**Severity now** is the decayed value, not the entered one — `severity × f(t)` from the Phase 1 spec, computed on read. Show the original alongside when they differ: `1.4 (from 4)`.

Active states sort first, then by days running descending. Cleared ones live behind a toggle.

### Adding one

Name (free text — personal language is fine), kind, severity, start date, optional duration, decay shape.

The decay picker shows a **small inline sketch of the curve**, not just a word. "Fast" means nothing; a steep line that flattens does.

| Shape | Behaviour |
| --- | --- |
| Static | Holds until cleared. **Default** |
| Linear | Even fade |
| Fast | Steep early recovery, long tail |
| Slow | Lingers, then drops |

### Two rules that must survive implementation

**Auto-clear stays off by default.** A fever set for 7 days is still there on day 12, and the user should not have had to predict that.

**Reaching zero severity does not clear a state.** It stays listed at zero until cleared by hand. Anything else means a debuff quietly vanishing while you still have it — the exact failure this feature exists to prevent.

Past its duration, show *ended, not cleared* with a one-tap clear.

### Not multiplied into anything

A state never scales points, ceilings or any metric. It sits beside the numbers and explains them. The only open exception from Phase 1 — an *unwell* state adding baseline physical load — stays parked.

### Symptom logging

Still separate, still not replaced. Per symptom, per day, medical record. The linkage between the two is unbuilt and undecided; neither feature blocks the other.

## 8. Schema and API

### Migration 002

```sql
CREATE TABLE dashboard (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE widget (
  id           INTEGER PRIMARY KEY,
  dashboard_id INTEGER NOT NULL REFERENCES dashboard(id),
  title        TEXT,
  viz          TEXT NOT NULL,          -- bar, line, cumulative, number,
                                       -- list, bands, split_bar, table
  query        TEXT NOT NULL DEFAULT '{}',  -- JSON, section 4
  options      TEXT NOT NULL DEFAULT '{}',  -- JSON, per-viz display
  x            INTEGER NOT NULL DEFAULT 0,
  y            INTEGER NOT NULL DEFAULT 0,
  w            INTEGER NOT NULL DEFAULT 4,
  h            INTEGER NOT NULL DEFAULT 4,
  position     INTEGER NOT NULL DEFAULT 0,  -- mobile stack order
  deleted_at   TEXT
);
CREATE INDEX widget_dash ON widget(dashboard_id) WHERE deleted_at IS NULL;

-- Points stored at log time (section 6). Additive; backfilled once.
ALTER TABLE session ADD COLUMN points REAL;
```

No other schema changes. `day_plan` and `state` already carry everything sections 6 and 7 need — which was the point of creating them in migration 001.

`x`, `y`, `w`, `h` map straight onto react-grid-layout. `position` is separate so reordering on mobile does not disturb the desktop grid.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/metrics` | Section 4. The one data endpoint for every widget |
| GET | `/api/metrics/catalog` | The registry — drives the widget editor's dropdowns |
| GET | `/api/dashboards` | With their widgets |
| POST PATCH DELETE | `/api/dashboards[/:id]` |  |
| POST PATCH DELETE | `/api/widgets[/:id]` |  |
| PATCH | `/api/dashboards/:id/layout` | Bulk x/y/w/h after a drag. One call, not one per widget |
| GET PATCH | `/api/day/:date` | Plan, ceilings, totals, ceiling feedback. Endpoint exists from Phase 1 |
| CRUD | `/api/states` | Exists from Phase 1; gets its UI here |

`/api/metrics/catalog` is what keeps the widget editor honest: the UI offers only groupings and filters the server actually supports, so a widget cannot be built that the backend will reject.

## 9. Build order

| # | Step | Done when |
| --- | --- | --- |
| 1 | Migration 002 + default dashboards | Three dashboards seeded, widgets attached; every session has `points` |
| 2 | Metrics registry: `session_hours`, `work_points` | curl returns correct daily totals, hand-checked against SQL |
| 3 | Direction guard | A split spanning spend and restore returns 400 |
| 4 | `/api/metrics/catalog` | Lists each metric's groups and filters |
| 5 | Dashboard shell: react-grid-layout, view mode | Three dashboards render, no editing yet |
| 6 | `bar`, `line`, `number` renderers | A widget shows real data from the API |
| 7 | Edit mode: drag, resize, bulk layout save | Reload keeps the layout; no accidental drags in view mode |
| 8 | Widget editor driven by the catalog | Build "Personal hours per week" without touching code |
| 9 | Remaining metrics | All ten from section 4 |
| 10 | `split_bar`, `cumulative`, `list`, `table` |  |
| 11 | `bands` widget | A 3-week debuff draws as one span, not 21 labels |
| 12 | Day screen: plan, readout, ceiling question | Readout shows planned vs spent; past days stay editable |
| 13 | Ceiling suggestion and adjustment | "Too high" drops \~20% and holds three days |
| 14 | Buffs screen with decay sketch | Severity now differs from entered; zero does not clear |
| 15 | Mobile: single column, no edit | Widgets below `min_width_px` fall back to `number` |

Steps 1–4 are the foundation — everything after is a renderer or a screen. If step 4 is right, steps 8–10 are mostly mechanical.

### Tests

Arithmetic only, as always:

- Each metric against hand-written SQL on a seeded fixture
- Day boundaries in local time, not UTC — a session at 23:30 IST belongs to that day
- Week grouping follows the week-start setting, for every start day
- A rate change leaves past sessions' points unchanged; a new session uses the new rate
- Decay curves at t=0, mid, past duration
- Direction guard rejects every mixed combination
- Empty ranges return `[]`, not an error, and widgets render empty rather than blank

### Decisions (Oct 30)

1. **Ranges** — keep all five: `7d / 30d / 90d / 1y / all`, plus explicit `from`/`to`.
2. **Week start day** — a setting, default Monday. Every `week` grouping reads it.
3. **Drift** — shown greyed out, with a short "needs a morning plan" note, until there are `day_plan` rows to compare against. Not dropped.
4. **Widget refresh** — fetch on mount, plus a refresh button on each widget. No polling. Live updates over a websocket can come later if a real need shows up.
5. **Day label thresholds** — skipped. The day label is deferred out of Phase 2 (section 6).
6. **Day locking** — removed. Days stay editable (section 6).
7. **Points stored per session** — saved at log time, so rate changes never rewrite history. No effective-dated rates.
