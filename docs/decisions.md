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

## 2026-10-29 — Capture provider: one interface, OpenAI-compatible client
**What:** `capture.Provider` has one method; `capture.OpenAI` calls `<endpoint>/chat/completions` with `temperature 0` and `response_format: json_object`, and pulls the first `{...}` out of the reply (tolerates code fences). Every returned field is checked against the real lookups by `capture.Normalise`; unknown names, impossible hours/difficulty and keys not among the SQLite candidates become null.
**Why:** The model picks from real rows, never invents them. Settings are read per call, so changing the endpoint needs no restart. The 5 s budget covers the whole model round trip.
**Rejected:** Letting the model return ids (it would invent them); vendor SDKs (adds dependencies for one POST).

## 2026-10-29 — Candidate matching by shared words
**What:** Open tasks (todo/in-progress behaviour) are scored by how many distinct words (3+ letters, not stopwords) of the capture text appear in the title; the top 8 go into the prompt.
**Why:** Plain SQL `instr`, no FTS table to keep in sync (FTS5 would need a schema addition).

## 2026-10-29 — Accounts: one database file per person
**What:** The owner asked for a login page and multiple users with separate data. `auth.db` holds accounts and login sessions; each person gets their own SQLite file with the unchanged JitterBug schema. Middleware resolves the session cookie to that person's `*db.DB` and puts it on the request context.
**Why:** Isolation is structural: no query can forget a `WHERE user_id = ?`, all single-user code and tests stay valid, and one person's data can be backed up, restored or handed over as one file.
**Rejected:** A `user_id` column on every table (touches every query; one missed filter leaks data); a shared board (not what was asked).

## 2026-10-29 — First person to open the app becomes admin; no open sign-up
**What:** `POST /api/auth/setup` works only while no accounts exist. After that, only admins create accounts. The last active admin cannot be demoted or disabled.
**Why:** Owner's choice. Setup refusing once an account exists means a stranger cannot take over a running server.

## 2026-10-29 — Session cookies, bcrypt, lockout, origin check
**What:** Random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its sha256 is stored. 30-day sliding expiry. bcrypt (default cost) passwords, 8-72 characters; unknown usernames still run a bcrypt compare so timing doesn't reveal which usernames exist. 5 failures lock a username for 15 minutes (in memory). State-changing requests with an `Origin` header from another host get 403. Changing your password signs out your other sessions; an admin reset or disable signs the person out everywhere.
**Rejected:** JWTs (can't be revoked without a table anyway); argon2 (bcrypt is in x/crypto and ample here).

## 2026-10-29 — Existing single-user database adopted by the first admin
**What:** If `JITTERBUG_DB` (default `jitterbug.db`) exists when the admin account is created, the admin's `db_file` points at it. It is not moved or copied.
**Why:** Upgrading never orphans data and never rewrites the old file.

## 2026-10-29 — Swimlanes are separate drag contexts
**What:** Grouped boards render one dnd-kit context per lane; cards move between status columns within a lane, not between lanes.
**Why:** Dragging across lanes would silently change the grouped field (epic, priority...), which is easy to do by accident; changing it is one click in the task panel. `board_pos` is per status column, so moving within a lane between two cards still orders correctly against cards in other lanes.

## 2026-10-29 — Jira import runs in one transaction; dry run rolls it back
**What:** The importer does every insert inside one transaction; `--dry-run` reports and rolls back.
**Why:** A dry run then exercises exactly the code that will run for real, so a clean dry run means a clean import, and a failure half way leaves nothing behind.

## 2026-10-29 — Palette checked against published design systems
**What:** The dark palette (Atlassian's 2022–2024 dark tokens, from memory) was checked against the published packages `@atlaskit/tokens` 20.8.2 (themes `atlassian-dark`, `atlassian-dark-increased-contrast`) and `@primer/primitives` 11.10.0 (`dark`, `dark-dimmed`), and against Material Design's dark-theme guidance (dark grey not black; avoid pure white text; desaturated colours; WCAG AA 4.5:1 for text). Measured WCAG contrast on the card surface:

| Palette | text | secondary | subtlest | link | card vs column |
| --- | --- | --- | --- | --- | --- |
| JitterBug now | 11.5 | 6.6 | 5.3 | 5.5 | 1.16 + shadow |
| Atlassian current (`#1F1F21`, neutral grey) | 9.8 | 6.7 | 5.4 | 5.6 | 1.15 + shadow |
| Atlassian increased contrast | 11.9 | 9.8 | 8.5 | 11.6 | 1.15 + shadow |
| Primer dark dimmed | 9.7 | 4.8 | 4.8 | 4.1 | 1.23 |
| Spec section 2 original | 17.6 | 7.2 | 7.2 | 7.2 | 1.04 |

**Why kept:** All text passes AA and matches Atlassian's current theme within a point; the original's problem was surfaces (1.04, indistinguishable) and pure-white glare, not text. Atlassian's newer theme differs mainly in hue (neutral grey instead of blue-grey), which is a taste choice offered to the owner.
**Fixed:** Status/priority lozenges failed for dark user-chosen colours (Backlog 2.6:1, Cancelled 1.8:1, grey To do/Low 4.4:1, epic 4.2:1). Lozenge text is now lightened toward white only as far as needed to reach 4.5:1 on its tint (`readable()` in `palette.ts`).
