# Decisions

Append-only. One entry per non-obvious choice: date, what, why, what was rejected.

## 2026-10-29 — Migration version in `PRAGMA user_version`
**What:** The migration runner records the applied version in SQLite's `user_version` header field.
**Why:** No extra table to explain, and it is atomic with the migration's transaction.
**Rejected:** A `schema_migrations` table — more schema for no benefit with numbered files.

## 2026-10-29 — Fixed-width nanosecond timestamps
**What:** All timestamps are written as `YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ` (UTC).
**Why:** Fixed width makes string order equal time order, so `ORDER BY at` and `MAX(at)` are correct, and two writes in the same millisecond still get distinct `updated_at` values for optimistic concurrency.
**Rejected:** Second precision (collides), variable-width RFC 3339 (sorts wrong).

## 2026-10-29 — One connection, immediate transactions
**What:** `SetMaxOpenConns(1)` and `_txlock=immediate`.
**Why:** Single user. Serialising all access makes key assignment race-free without retry loops, and a slow homelab disk is still far faster than one person clicks.
**Rejected:** A connection pool with retry-on-busy.

## 2026-10-29 — Key numbering from the highest key ever used
**What:** The next key is `PREFIX-(max N + 1)` over every task whose key starts with `PREFIX-`, deleted tasks included, computed inside the inserting transaction.
**Why:** Keys are permanent and never reused. Counting by key prefix (not `area_id`) means moving a task between areas never disturbs numbering.
**Rejected:** A per-area counter column (needs a schema change) and `COUNT(*)` (reuses keys after deletes).

## 2026-10-29 — PATCH bodies are partial; null clears
**What:** A PATCH sends only the fields it changes. Absent = untouched, `null` = clear. `custom` is merged key by key, with `null` removing a key.
**Why:** Sending a whole `custom` object would strip keys the client did not know about, which the spec forbids.

## 2026-10-29 — Derived dates computed in Go, not in the `task_dates` SQL view
**What:** All transition-log dates (first/last started, completed, cancelled, ages, time in status) are computed by `deriveDates` in `internal/db/derive.go`.
**Why:** "Every derived value has exactly one implementation." Completed/cancelled need run-tracking (see below) that is awkward in SQL; having the view as well would be a second implementation.
**Rejected:** Creating the section 4 `task_dates` view alongside — two implementations to drift.

## 2026-10-29 — Completed/cancelled are the start of the current run
**What:** `completed_at` is when the task entered a `done`-behaviour status from a non-done one, as long as it is still in a done status. Moving Done → another done status keeps the date. Leaving done clears it. Same rule for `cancelled_at`.
**Why:** Matches "latest transition into done; NULL if it moved back out" while not shifting the completion date on a done-to-done move.

## 2026-10-29 — Moves are last-write-wins and reorders do not bump `updated_at`
**What:** `POST /move` takes no `updated_at`. A status change bumps `updated_at`; a reorder within a column does not.
**Why:** Board drags are exempt from concurrency (section 9). Not bumping on reorder means dragging cards never makes an open task panel's next save 409.

## 2026-10-29 — Renormalise threshold applies to the new card's gap
**What:** The column is renumbered when the midpoint would land within 1e-6 of a neighbour (i.e. neighbours less than 2e-6 apart), not only when neighbours are already within 1e-6.
**Why:** Otherwise inserting between two cards 1.5e-6 apart creates a pair 7.5e-7 apart, breaking the invariant the test checks.

## 2026-10-29 — Soft-deleted lookup rows are renamed
**What:** Deleting a status, priority, energy type, subtype or area sets `deleted_at` and renames it `name [deleted #id]`.
**Why:** `name` is `UNIQUE` in the schema, so without the rename a deleted "Blocked" would block creating a new "Blocked" forever. History still points at the row by id.
**Rejected:** Partial unique indexes (`WHERE deleted_at IS NULL`) — needs a schema change to migration 001's constraints.

## 2026-10-29 — Status categories are hard-deleted
**What:** `DELETE /api/status-categories/:id` removes the row, only for non-builtin categories with no statuses.
**Why:** `status_category` has no `deleted_at` column, and an unused category is referenced by nothing.
