# JitterBug — Change 001: All energy types are equal

Oct 30, 2026 · @Aakash Kumar · Applies to: Phase 2 build spec

## Summary

Energy types stop being split into **spend** (work) and **restore** (rest). There are just types — Engineering, Physical, Admin, Sleep, Leisure, and whatever else gets added. Each one is different, none is special.

Every type earns points. Everything in life counts, not only productive work.

The dashboard gets a chart that shows every type, one small chart per type.

## Why

The spend/restore split quietly ranked work above everything else. Rest only existed as the thing that refills you for more work. That is the framing the app is meant to avoid.

Treating every type the same also removes code: no direction field, no direction guard, no separate "rest" widgets.

## What changes

### 1. No direction on energy types

- `energy_type` no longer has a meaningful direction. The column stays (migrations are additive only), but nothing reads it.
- The metrics API response drops the `direction` field.
- Types are listed in one flat list everywhere: settings, plan, readout, widget editor.

### 2. Points for every type

- Every type has a points rate. Sessions of every type store points when logged, as already decided.
- Types that had no rate before (the old restore types) start at **1 point per hour** until you set something else.
- The backfill in migration 002 uses those rates, so old Sleep and Leisure sessions get points too.
- `work_points` is renamed to **`points`**, and it can group and split by `energy_type`.

### 3. The no-netting rule, rewritten

The old rule ("nothing nets rest against work") assumed two opposing sides. With no sides, it becomes:

**Types are never subtracted from each other or divided by each other.** Adding them up is fine, because everything counts.

- Allowed: total points for a day across all types, points split by type, hours split by type.
- Not allowed: "work minus rest", "work ÷ rest", balance, net energy, productivity rate. These metrics still may not exist.
- The **direction guard (400 on mixed splits) is removed.** A split across all types is now the normal case.

### 4. Day screen

**Morning plan:** a ceiling can be set for **any** type, and each one is optional. Leave a type blank and it has no ceiling.

**Evening readout:** one list of all types, no SPEND / RESTORE sections.

```
Engineering  planned 10  ·  actual 11  ⚠
Physical     planned  5  ·  actual  2
Sleep                    ·  actual  7
Leisure      planned  3  ·  actual  2.5

IN FORCE     Unwell (2), day 1
```

The warning still fires only when a type goes over a ceiling you set for it. A type with no ceiling never warns.

**Ceiling adjustment** ("too high / right / too low") is asked per type that had a ceiling.

### 5. Metrics registry

| Metric | Change |
| --- | --- |
| `session_hours` | Direction column removed |
| `work_points` | Renamed `points`; adds `energy_type` to groups |
| `ceiling_vs_actual` | Covers every type with a ceiling, not only spend types |
| `days_over_plan` | A day counts if any type went over its ceiling |

### 6. Widgets

**New viz: `small_multiples`.** One small chart per energy type, laid out as a grid inside one widget.

- Each mini chart has its own y-scale, with the value labels shown, so a type with 8 hours of sleep doesn't flatten a type with 1 hour of admin.
- Same date range and x-axis across all of them, so days line up vertically.
- Types are never added together inside this widget.
- On mobile, the grid becomes a vertical stack. Below `min_width_px`, each type falls back to a `number`.

**New widgets:**

| Widget | viz | metric |
| --- | --- | --- |
| All energy types — hours | `small_multiples` | `session_hours` · day · split=energy\_type |
| All energy types — points | `small_multiples` | `points` · day · split=energy\_type |
| Points per day by type | `split_bar` | `points` · day · split=energy\_type |

**Changed widgets:**

| Old | New |
| --- | --- |
| Work points per day | Points per day (all types), or filtered to one type |
| Work points, cumulative | Points, cumulative (all types) |
| Rest hours per day | Removed as a special case — any type's hours is just a filter |
| Sleep vs leisure | Removed — covered by the all-types widgets |

The separate **Rest** section in the widget catalogue is removed.

**Default dashboards:**

| Dashboard | Widgets |
| --- | --- |
| **Today** | Ceiling vs actual (all types), today's sessions, active states, stuck work |
| **This month** | All energy types — hours, points per day by type, conditions band, counts, days over plan |
| **The year** | Points cumulative, all energy types — points (by week), tasks closed per week |

"Rest days per month" is dropped from The year. It depended on the day label, which is deferred.

### 7. Schema

No new tables. Two additive changes, folded into migration 002:

```sql
-- Every type gets a rate; old restore types default to 1 point/hour.
UPDATE energy_type SET points_per_hour = 1 WHERE points_per_hour IS NULL;
```

(If `energy_type` has no rate column yet, add `points_per_hour REAL NOT NULL DEFAULT 1`.)

The `direction` column stays in the table and is ignored.

### 8. Build order

| # | Change |
| --- | --- |
| 3 | **Removed.** No direction guard |
| 9 | "All ten metrics" — `work_points` is now `points` |
| 10 | Add `small_multiples` renderer alongside `split_bar`, `cumulative`, `list`, `table` |
| 12 | Readout is one flat list of all types |

### 9. Tests

- Remove: "Direction guard rejects every mixed combination".
- Add: a split by `energy_type` returns every type, including old restore types.
- Add: old restore-type sessions have points after the backfill.
- Add: no metric in the registry subtracts or divides one type by another.

## Spec sections affected

1 (rules carried over, rule 3), 4 (registry, no-netting rule), 5 (widget catalogue, defaults), 6 (day screen), 8 (schema, endpoints), 9 (build order, tests).

The Phase 2 spec itself is not edited yet. This doc is the change; it gets folded in once agreed.

## Open

1. **Starting rates.** 1 point per hour for every old restore type is a placeholder. Real rates are yours to set.
