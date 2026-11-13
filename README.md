# Reskon

Self-hosted task board and time log. One Go binary. Several people can share a server; each person's data lives in their own SQLite file.
What the app does is described in [`SPEC.md`](SPEC.md); why it works that way is in [`docs/decisions.md`](docs/decisions.md).

## Build

Needs Go 1.27+ and Node 22+. No cgo, no C toolchain.

```sh
make build        # npm ci + vite build into web/dist, then go build -> ./jitterbug
make test         # gofmt check, go vet, go test (server and phone core), TypeScript typecheck, ESLint, component tests
make check        # all of that plus golangci-lint, race tests and govulncheck (race tests need a C compiler)
```

By hand: `cd web && npm ci && npm run build && cd .. && CGO_ENABLED=0 go build -o jitterbug ./cmd/jitterbug`.
The frontend in `web/dist` is embedded at `go build` time, so build the web app first.

## Run

```sh
./jitterbug                                  # http://localhost:8080, data in ./data
JITTERBUG_DATA=/srv/jb JITTERBUG_ADDR=:9000 ./jitterbug
```

The first time you open it, it asks you to create the **admin** account. After that there is no open sign-up: the admin adds people under **Settings → People**, and can reset passwords, grant admin, or disable an account (that signs the person out; their data is kept). Everyone changes their own password under **Settings → Account**.

| Variable | Default | Meaning |
| --- | --- | --- |
| `JITTERBUG_DATA` | `data` | Data directory: `auth.db` (accounts, login sessions) and `users/<name>-<id>.db` (one database per person) |
| `JITTERBUG_DB` | `jitterbug.db` | A single-user database from before accounts existed. If this file exists when the admin account is created, it becomes the admin's data, untouched. |
| `JITTERBUG_ADDR` | `:8080` | Listen address |
| `JITTERBUG_LLM_ENDPOINT` | — | OpenAI-compatible base URL for quick capture, e.g. `http://ollama:11434/v1` |
| `JITTERBUG_LLM_MODEL` | — | Model name |
| `JITTERBUG_LLM_API_KEY` | — | Bearer token, if the endpoint needs one |
| `JITTERBUG_SETUP_TOKEN` | — | If set, the first-run screen must be given this word before it creates the admin account. Recommended on any server others can reach. |
| `JITTERBUG_BEHIND_PROXY` | — | `1` when a reverse proxy sits in front: sign-in limits then use the address the proxy puts last in `X-Forwarded-For`. |
| `JITTERBUG_SECURE_COOKIE` | — | `1` to always mark the session cookie Secure (HTTPS only). |
| `JITTERBUG_LLM_REASONING_EFFORT` | — | `low`, `medium` or `high`; sent only when set. Use `low` for reasoning models (e.g. gpt-oss) so capture answers inside its 5 seconds |

The LLM values can also be set per person in **Settings → Capture & weights**, which take precedence. Without them, capture uses the manual form. The app never needs the LLM to start.

Sign-in uses a session cookie (HttpOnly, SameSite=Lax, 30 days, renewed while used; Secure when served over HTTPS or behind a proxy sending `X-Forwarded-Proto: https`). Passwords are bcrypt-hashed; five wrong passwords lock that username for 15 minutes. If it will face the internet, put it behind HTTPS (e.g. Caddy or nginx).

### Container

```sh
docker build -t jitterbug .
docker run -d --name jitterbug -p 8080:8080 -v jitterbug-data:/data -e TZ=Europe/London jitterbug
```

Everything lives in the `/data` volume (`auth.db`, `users/`). An older `/data/jitterbug.db` is adopted by the first admin. Set `TZ` so "today" matches your local day.

### Development

```sh
./jitterbug                 # API on :8080
cd web && npm run dev       # Vite on :5173, proxies /api to :8080
```

## Version

Reskon has one version number, `major.minor.patch` (for example `0.2.0`), written in the `VERSION` file at the top of the repository. The server, the web app and the phone app all show it: the web app on the sign-in page and under Settings › About, the phone under Settings › About (with the server's version when it is connected to one), and the server in `GET /api/health`. The phone's `versionName` is read from the same file, and its `versionCode` is `major × 10000 + minor × 100 + patch`.

Next to the version is the day it was last updated, `Updated` in `internal/version/version.go` (year-month-day, for example `2026-11-13`). Set it to today whenever you send a build to the test or live server, even if the number did not change. Settings › About shows it as "Updated 13 Nov 2026", and `GET /api/health` returns it.

To release a new version: change the number in three places that must agree, `VERSION`, `internal/version/version.go` and `web/package.json` (a test fails if they differ), commit, and tag the commit `v<version>` (`git tag v0.2.0`). Raise the middle number when the app gains something people will notice, and the last one for fixes only.

## Themes

**Settings → Appearance**: Default, Jira, Jira increased contrast, GitHub Dark, GitHub Dark Dimmed. Download any of them as a template (JSON, each colour explained), edit it, and upload it back. The choice is saved to your account.

## Import from Jira

Create the account first, then (server may keep running):

```sh
JITTERBUG_DATA=data ./jitterbug import-jira jira_old_data.db <username> --dry-run   # report only, writes nothing
JITTERBUG_DATA=data ./jitterbug import-jira jira_old_data.db <username>
```

Keys, epics, areas (from labels), status history, worklogs and comments come across; see `SPEC.md` section 12.3 for the mapping. It refuses to import the same export twice.

Jira labels map to areas named Main job / Personal / Freelance (created if missing). To use an area you already have, map the label: `--area MainJob="Day Job"` (repeatable).

## Back up

The databases run in WAL mode, so copying files while the server runs can miss recent writes. Use the built-in backup, which is safe while the server is running and writes `auth.db` plus one `<username>.db` per person into a new directory:

```sh
JITTERBUG_DATA=/srv/jb ./jitterbug backup /backups/jitterbug-$(date +%F)
# container:
docker exec jitterbug jitterbug backup /data/backup-$(date +%F)
```

Point `JITTERBUG_DATA` at the live data directory (inside the container it already is).

## Restore

1. Stop the server.
2. Copy `auth.db` from the backup into the data directory, and each `<username>.db` over that person's file in `users/` (the file name for each person is in `auth.db`: `sqlite3 auth.db "SELECT username, db_file FROM user"`). Delete any `-wal` and `-shm` files next to the ones you replaced.
3. Start the server. Migrations run automatically if a backup is older than the binary.

To restore one person only, replace just their file in `users/`.

## Layout

```
cmd/jitterbug/      main: env config, backup subcommand, server start
internal/auth/      accounts, passwords, login sessions (auth.db), per-user database pool
internal/db/        migrations (embedded), every SQL query, all derived values, the metrics registry
internal/api/       HTTP handlers: decode, call db, encode
internal/capture/   quick-capture parsing: provider interface, OpenAI-compatible client, validation
web/                React + Vite app; web/dist is embedded into the binary
docs/               decisions (why things are the way they are)
```

## Engineering checks

The repository's quality-tool recommendations, local commands, Go-to-Android bridge checks, and release gates are documented in [`docs/engineering-toolchain.md`](docs/engineering-toolchain.md). Claude Code reads [`AGENTS.md`](AGENTS.md) as the project-specific source of truth; optional review agents and slash skills live under `.claude/`. Start a focused feature task with `/go-quality`, `/web-ui-quality`, or `/android-go-bridge`, then request a read-only specialist review when useful.
