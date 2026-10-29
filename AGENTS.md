# AGENTS.md — read first

**What this is:** JitterBug, a self-hosted task board and time log. Several people can sign in to one server; each has a completely separate database.
**The spec:** [`build_spec_phase_1.md`](build_spec_phase_1.md) is authoritative on *what* and *why*. You cannot edit it. Where the code differs, append to [`docs/deviations.md`](docs/deviations.md) and say so in your handoff.

## Stack

- Go (`net/http`, stdlib mux), `modernc.org/sqlite` — pure Go, **no cgo**. Do not swap in `mattn/go-sqlite3`.
- SQLite, WAL mode: `<data>/auth.db` for accounts and login sessions (`internal/auth/migrations/`), plus one database per user with the JitterBug schema (`internal/db/migrations/`). Migration version tracked in `PRAGMA user_version`.
- Every `/api` call except health and `/api/auth/*` sign-in routes needs the session cookie; the middleware in `internal/api/server.go` puts the user's own `*db.DB` on the request context (`dbOf(ctx)`). Handlers never reach another user's database.
- React 18 + TypeScript + Vite, Ant Design 5 (one token block in `web/src/theme/antTheme.ts`, palette in `web/src/theme/palette.ts`), dnd-kit.
- The built frontend (`web/dist`) is embedded with `go:embed` — one binary.

## Build, run, test

```sh
make build    # frontend then binary
make test     # go vet + go test + tsc
./jitterbug   # :8080, ./data  (env: JITTERBUG_DATA, JITTERBUG_DB (legacy), JITTERBUG_ADDR, JITTERBUG_LLM_*)
docker build -t jitterbug .
```

Before calling a step done: run its acceptance check for real, `make test` passes, docs updated if schema/behaviour changed, the app starts from an empty DB **and** an existing one, bare **and** in the container.

## Rules that are easy to break

- **Schema:** migration 001 is the full schema. After first run, only additive migrations (`002_*.sql`, ...). Update `docs/schema.md` with each.
- **Derived values** (ages, first started, completed, time in status, points, progress, segments, weighted subtype hours, effective severity) are computed on read in `internal/db` (mostly `derive.go`), returned by the API, and **never** stored or recomputed in the client.
- **Status changes** only through `db.Move` / `POST /api/tasks/:id/move` (or status deletion), which writes the `status_transition` row in the same transaction. The log is append-only.
- **Code branches on `status_category.behaviour`** and `energy_type.direction`, never on a status or type name.
- **Nothing nets rest against work.** No ratio, balance or combined total of spend and restore, anywhere.
- **Filters resolve on the server** (`GET /api/tasks?view=:id`). The client sends a view id, not a query.
- **The task key is never shown on cards or in tables**, only in the task panel.
- **Capture never writes** and never fails because the LLM is down: `capture.Parser.Parse` always returns a usable form.
- **Custom fields:** unknown keys are kept, never stripped; `key` and `type` are immutable.
- Optimistic concurrency: task PATCH carries `updated_at`; 409 returns `{error, detail, current}`. Moves are last-write-wins.

## Code style

Boring over clever. Plain SQL, no ORM or query builder. Split files by feature; split any file passing ~400 lines. Use the spec's vocabulary: area, session, subtype, energy type, state, transition. One commit per step; never mix a refactor with a feature; don't reformat files you didn't change.

When the spec is silent: stop and ask. If working unattended and blocked, take the most reversible option, build the smallest version, and record it under **Needs review** in `docs/deviations.md`.

## Where things are

| Area | Server | Client |
| --- | --- | --- |
| Tasks, keys, PATCH concurrency | `internal/db/tasks.go` | `web/src/task/TaskPanel.tsx` |
| Move, transitions, board_pos | `internal/db/transitions.go`, `boardpos.go` | `web/src/board/` |
| Derived values | `internal/db/derive.go`, `cycletime.go`, `states.go` | display only |
| Views and filters | `internal/db/tasks_query.go`, `views.go` | `web/src/views/` |
| Lookups admin | `internal/db/admin.go`, `areas.go` | `web/src/admin/` |
| Sessions, day totals | `internal/db/sessions.go`, `day.go` | `web/src/sessions/` |
| Custom fields | `internal/db/customfields.go` | `web/src/fields/`, `web/src/admin/CustomFieldSettings.tsx` |
| Quick capture | `internal/capture/`, `internal/db/capture.go` | `web/src/capture/` |
| Accounts, sign-in | `internal/auth/`, `internal/api/auth.go` | `web/src/auth/` |
