# AGENTS.md — read first

**What this is:** JitterBug, a self-hosted task board and time log. Several people can sign in to one server; each has a completely separate database.
**The spec:** [`SPEC.md`](SPEC.md) says what the app does, in plain English. [`docs/decisions.md`](docs/decisions.md) says why, and lists the open questions. These are the only two docs besides this file, the README, [`docs/next-phase.md`](docs/next-phase.md) (the open to-do list) and [`docs/engineering-toolchain.md`](docs/engineering-toolchain.md). When you change what the app does, update `SPEC.md` in the same commit (and `docs/decisions.md` if a choice was made). The owner decides what the app does: a change of behaviour needs their yes. Write docs in plain English, with examples, for a reader who is new to web and database terms.

## Stack

- Go (`net/http`, stdlib mux), `modernc.org/sqlite` — pure Go, **no cgo**. Do not swap in `mattn/go-sqlite3`.
- SQLite, WAL mode: `<data>/auth.db` for accounts and login sessions (`internal/auth/migrations/`), plus one database per user with the JitterBug schema (`internal/db/migrations/`). Migration version tracked in `PRAGMA user_version`.
- Every `/api` call except health and `/api/auth/*` sign-in routes needs the session cookie; the middleware in `internal/api/server.go` puts the user's own `*db.DB` on the request context (`dbOf(ctx)`). Handlers never reach another user's database.
- React 18 + TypeScript + Vite, Ant Design 5 (one token block in `web/src/theme/antTheme.ts`, palette in `web/src/theme/palette.ts`), dnd-kit.
- The built frontend (`web/dist`) is embedded with `go:embed` — one binary.

## Build, run, test

```sh
make build    # frontend then binary
make test     # gofmt check, go vet + go test (server and mobile/), tsc, eslint, vitest
make check    # test + golangci-lint + race tests + govulncheck (race needs a C compiler: run on a Linux build machine)
./jitterbug   # :8080, ./data  (env: JITTERBUG_DATA, JITTERBUG_DB (legacy), JITTERBUG_ADDR, JITTERBUG_LLM_*)
docker build -t jitterbug .
```

Before calling a step done: run its acceptance check for real, `make test` passes, docs updated if schema/behaviour changed, the app starts from an empty DB **and** an existing one, bare **and** in the container.

### Where things run (read before starting anything)

This Windows PC (`X:\Personal\JitterBug`) is **for building and editing only**. The JitterBug server **never runs here**: do not start `./jitterbug`, run the container (`docker run`), or open or launch Docker Desktop (if the daemon is off, leave it off, and report the check as blocked).

What is fine here: `go vet`, `go test`, `tsc`, `vite build`, the Gradle/Android build, `gomobile`, and `gitleaks`.

Anything that needs the server running, the container started, or the app opened on an empty or existing database goes to the Linux server (192.168.0.8) with the tool in `tools/` (local only, not in git; read `tools/README.md`):

- `python tools/ship/deploy_test.py` sends a build to the **test** server (`~/JitterBug-perf`, port 8097) and checks it. Any AI may run it.
- `python tools/ship/deploy_live.py --live` is the **real** server (port 8080). Only when the owner asks.

Think of `tools/ship` as a remote control for that Linux machine. So "starts from an empty and an existing database" is checked there, not here. `docker build` and the container run also belong on that machine; if the Linux server can't do it yet, ask the owner instead of using Docker on this PC.

## Rules that are easy to break

- **Schema:** migration 001 is the full schema. After first run, only additive migrations (`002_*.sql`, ...). Update `SPEC.md` section 15 (how the data is stored) with each.
- **Derived values** (ages, first started, completed, time in status, points, progress, segments, weighted subtype hours, effective severity) are computed on read in `internal/db` (mostly `derive.go`), returned by the API, and **never** stored or recomputed in the client.
- **Status changes** only through `db.Move` / `POST /api/tasks/:id/move` (or status deletion), which writes the `status_transition` row in the same transaction. The log is append-only.
- **Code branches on `status_category.behaviour`**, never on a status or type name.
- **All energy types are equal** (Change 001). There is no spend/restore: `energy_type.direction` stays in the table and nothing reads it. Every type earns points; lists of types are one flat list.
- **Types are never subtracted from or divided by each other.** Adding them up is fine (everything counts). No balance, net, "work ÷ rest" or productivity-rate metric may exist (`TestNoMetricNetsEnergyTypes`).
- **Metrics are a registry, not free SQL.** A new measure is one `register(...)` in `internal/db/metrics_*.go`; a new chart is one renderer in `web/src/dashboard/viz/`. Totals and running sums come from the server.
- **Session points are stored at log time** (hours × share × the type's `points_per_hour` × difficulty, the part's else the session's task's else 1). An edit that changes hours, intensity, energy types or shares, or task recalculates them at today's rates (Change 002); a rate change alone never does, unless the user asks (`"recalculate": true`).
- **Filters resolve on the server** (`GET /api/tasks?view=:id`). The client sends a view id, not a query.
- **The task key is never shown on cards or in tables**, only in the task panel.
- **Capture never writes** and never fails because the LLM is down: `capture.Parser.Parse` always returns a usable form.
- **Custom fields:** unknown keys are kept, never stripped; `key` and `type` are immutable.
- Optimistic concurrency: task PATCH carries `updated_at`; 409 returns `{error, detail, current}`. Moves are last-write-wins.

## Code style

Boring over clever. Plain SQL, no ORM or query builder. Split files by feature; split any file passing ~400 lines. Use the spec's vocabulary: area, session, subtype, energy type, state, transition. One commit per step; never mix a refactor with a feature; don't reformat files you didn't change.

When the spec is silent: stop and ask. If working unattended and blocked, take the most reversible option, build the smallest version, and add it to **Open questions** in `docs/decisions.md`.

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
| Metrics API (registry, guard) | `internal/db/metrics*.go` | `web/src/dashboard/viz/` |
| Dashboards, widgets, layout | `internal/db/dashboards.go` | `web/src/dashboard/` |
| Day plan, readout, suggestions | `internal/db/day.go`, `dayplan.go` | `web/src/day/` |
| Buffs and debuffs | `internal/db/states.go` | `web/src/states/` |
