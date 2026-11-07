---
name: go-quality
description: Implement or review a Go server/core change with JitterBug's SQLite, per-user isolation, no-cgo, and migration rules.
---
# Go change workflow

1. Read `AGENTS.md`, relevant `SPEC.md` sections, and `docs/decisions.md` before changing behavior.
2. Trace the affected handler, database code, migration, and tests. Keep business rules and derived values in Go, not the web or Android clients.
3. Preserve `modernc.org/sqlite`, no-cgo production builds, per-user database isolation, append-only status history, and additive migrations.
4. Add focused unit, handler, migration, or fuzz tests. Use `httptest` for API behavior.
5. Run `gofmt`, `go vet ./...`, and relevant `go test`; for broad changes also run `go test -race ./...`, `govulncheck ./...`, and `CGO_ENABLED=0 go build ./cmd/jitterbug`.
6. If user-visible behavior or stored schema changes, update the spec and decisions as required.
7. Report the exact checks and results; do not claim deployment or live checks unless performed.
