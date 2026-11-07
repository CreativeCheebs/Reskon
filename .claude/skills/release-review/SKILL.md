---
name: release-review
description: Review a JitterBug release across the Go server, embedded React app, SQLite data, Docker image, and Android Go-core AAR.
---
# Release review

1. Confirm the diff and acceptance checks. Read `AGENTS.md` and relevant spec/decision records.
2. Run `make test`, `make build`, the Go vulnerability scan, and relevant Android checks.
3. Verify additive SQLite migrations from both empty and prior-release databases; protect user data and test per-account isolation.
4. Build the Docker image and verify startup in a container. Check the HTTPS reverse-proxy/session-cookie assumptions.
5. Check the Android AAR was rebuilt from the current Go core and retains 16 KB page support.
6. Review changelog/spec updates, secrets, release artifacts, backup/restore, and rollback plan.
7. Report evidence and unresolved risks. Do not deploy or publish unless explicitly requested.
