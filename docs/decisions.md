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
