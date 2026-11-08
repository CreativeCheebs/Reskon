# Reskon engineering toolchain

This checklist is tailored to the existing app and its Go-backed Android client. It is a plan for evolving the initial release; it does not replace the product decisions in `AGENTS.md`, `SPEC.md`, or `docs/decisions.md`.

## Existing architecture

- `cmd/` and `internal/`: Go server, HTTP API, per-user SQLite, capture parser, migrations.
- `web/`: React 18 + TypeScript + Vite + Ant Design 5. `web/src/theme/antTheme.ts` and `palette.ts` are the theme source of truth.
- `mobile/jbcore/`: Go business logic shared with the server.
- `mobile/android/`: Kotlin, Jetpack Compose, Material 3. `mobile/build.ps1` binds the Go core into an Android AAR through `gomobile`.
- SQLite is `modernc.org/sqlite`, pure Go and no-cgo. Keep this property.

## Recommended quality gates

| Surface | Local / CI checks |
|---|---|
| Go server and core | `gofmt`, `go vet ./...`, `go test ./...`, `go test -race ./...`, `govulncheck ./...`, `CGO_ENABLED=0 go build ./cmd/jitterbug` |
| Web | `npm ci`, `npm run typecheck`, `npm run build`; add ESLint, Prettier, Vitest + React Testing Library for component behavior, Playwright for browser journeys, and axe checks for accessibility |
| Go-to-Android bridge | Build the AAR with `mobile/build.ps1`; keep the 16 KB page-size linker option; add Android tests that exercise exported Go APIs through the generated binding |
| Android | Gradle `lintDebug`, `testDebugUnitTest`, and `assembleDebug`; Compose semantics/UI tests for screen behavior; Maestro for cross-screen user journeys; Macrobenchmark for startup and scroll performance when needed |
| Containers and supply chain | Build the production Docker image; scan it with Trivy; run Gitleaks on history; review dependency changes; generate an SBOM with Syft for release artifacts |
| API | `net/http/httptest` handler tests, fuzz request parsers/decoders, test auth/session boundaries and per-user database isolation; use a passive ZAP baseline only against a disposable test instance |

Do not add PrimeReact: the web app already uses Ant Design 5. PrimeIcons in the product spec are an icon set and do not imply PrimeReact. Keep Material 3 on Android and Ant Design on web, with product-level decisions recorded in the spec if a visual behavior should match across platforms.

## Local commands

The current Makefile provides `make test` (gofmt check, Go vet and tests for the server and `mobile/`, TypeScript typecheck, ESLint and Vitest), `make check` (that plus golangci-lint, race tests and govulncheck), and `make build` (web build followed by the embedded server binary). Useful additions after the CI baseline is stable:

```sh
govulncheck ./...
go test -race ./...
CGO_ENABLED=0 go build -trimpath -o jitterbug ./cmd/jitterbug
cd web && npm ci && npm run typecheck && npm run build
```

Android AAR and APK build on Windows:

```powershell
.
mobile\build.ps1
Set-Location mobile\android
.\gradlew.bat lintDebug testDebugUnitTest assembleDebug
```

The browser end-to-end script under `ui-qa` (if present) needs a running server. Use a disposable database/account, never live user data. The project guide in `AGENTS.md` requires checking startup with both empty and existing databases and checking the container build before treating a release change as done.

## Design and testing approach

- Use Ant Design tokens/components consistently; avoid ad hoc colors and spacing. Check the existing light/dark and named theme variants before introducing new visual rules.
- Use Material 3 color roles, typography, and semantics in Compose. Test accessibility labels, touch targets, text scaling, keyboard focus, system bars, and offline states.
- Prefer focused tests around business logic, database migrations, and API authorization. UI screenshots help spot regressions but do not replace interaction or accessibility checks.
- Keep browser tests independent from production services. Test authentication and per-user isolation with disposable databases.

## Using the Claude Code files

Claude Code reads `AGENTS.md` for repository rules. Skills under `.claude/skills/` can be invoked as slash commands: `/go-quality`, `/web-ui-quality`, `/android-go-bridge`, `/security-review`, and `/release-review`. Specialist reviewers under `.claude/agents/` are read-only; ask for them by name (for example, `go-reviewer`, `security-reviewer`, `design-reviewer`, or `qa-reviewer`) when a separate review helps. Keep each implementation request narrow and describe the acceptance behavior. Product changes still need the owner's approval when the specification is silent or a decision is open.

## Release and operations gates

- Product behavior changes update `SPEC.md`; decisions and unresolved product questions update `docs/decisions.md` as required by `AGENTS.md`.
- SQLite changes are additive migrations; test migration from a database created by the previous release and startup from an empty database.
- Keep signing keys, API tokens, `.env`, databases, backups, and logs outside version control.
- Ship the embedded frontend and Go server as one binary; verify both `make build` and `docker build`.
- Internet-facing use stays behind HTTPS. Keep session cookies secure behind the proxy and never expose the plain HTTP listener directly to an untrusted network.
