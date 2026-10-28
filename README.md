# JitterBug

Self-hosted, single-user task board and time log. One Go binary, one SQLite file.
The build contract is [`build_spec_phase_1.md`](build_spec_phase_1.md); where the code differs, see [`docs/deviations.md`](docs/deviations.md).

## Build

Needs Go 1.27+ and Node 22+. No cgo, no C toolchain.

```sh
make build        # npm ci + vite build into web/dist, then go build -> ./jitterbug
make test         # go vet, go test, TypeScript typecheck
```

By hand: `cd web && npm ci && npm run build && cd .. && CGO_ENABLED=0 go build -o jitterbug ./cmd/jitterbug`.
The frontend in `web/dist` is embedded at `go build` time, so build the web app first.

## Run

```sh
./jitterbug                                  # http://localhost:8080, database ./jitterbug.db
JITTERBUG_DB=/srv/jb/jitterbug.db JITTERBUG_ADDR=:9000 ./jitterbug
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `JITTERBUG_DB` | `jitterbug.db` | SQLite file (created and migrated on start) |
| `JITTERBUG_ADDR` | `:8080` | Listen address |
| `JITTERBUG_LLM_ENDPOINT` | — | OpenAI-compatible base URL for quick capture, e.g. `http://ollama:11434/v1` |
| `JITTERBUG_LLM_MODEL` | — | Model name |
| `JITTERBUG_LLM_API_KEY` | — | Bearer token, if the endpoint needs one |

The LLM values can also be set in **Settings → Capture & weights**, which take precedence. Without them, capture uses the manual form. The app never needs the LLM to start.

There is no authentication. Bind it to your home network only; add auth before it ever faces the internet.

### Container

```sh
docker build -t jitterbug .
docker run -d --name jitterbug -p 8080:8080 -v jitterbug-data:/data -e TZ=Europe/London jitterbug
```

The database lives at `/data/jitterbug.db` in the volume. Set `TZ` so "today" matches your local day.

### Development

```sh
./jitterbug                 # API on :8080
cd web && npm run dev       # Vite on :5173, proxies /api to :8080
```

## Back up

The database runs in WAL mode, so copying the `.db` file alone while the server runs can miss recent writes. Use the built-in backup, which is safe while the server is running:

```sh
./jitterbug backup /backups/jitterbug-$(date +%F).db
# container:
docker exec jitterbug jitterbug backup /data/backup-$(date +%F).db
```

(`JITTERBUG_DB` must point at the live database, as it does inside the container.) `sqlite3 jitterbug.db ".backup out.db"` works too.

## Restore

1. Stop the server.
2. Replace the database file with the backup, and delete any `jitterbug.db-wal` and `jitterbug.db-shm` next to it.
3. Start the server. Migrations run automatically if the backup is older than the binary.

```sh
systemctl stop jitterbug        # or: docker stop jitterbug
cp /backups/jitterbug-2026-10-29.db /srv/jb/jitterbug.db
rm -f /srv/jb/jitterbug.db-wal /srv/jb/jitterbug.db-shm
systemctl start jitterbug
```

## Layout

```
cmd/jitterbug/      main: env config, backup subcommand, server start
internal/db/        migrations (embedded), every SQL query, all derived values
internal/api/       HTTP handlers: decode, call db, encode
internal/capture/   quick-capture parsing: provider interface, OpenAI-compatible client, validation
web/                React + Vite app; web/dist is embedded into the binary
docs/               decisions, schema, deviations
```
