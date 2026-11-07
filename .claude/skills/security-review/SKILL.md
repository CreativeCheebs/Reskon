---
name: security-review
description: Review JitterBug changes affecting HTTP auth, SQLite, user isolation, secrets, Docker, dependencies, or Android networking.
---
# Security review workflow

1. Read the relevant `AGENTS.md`, `SPEC.md`, Go handlers, middleware, migrations, and deployment files.
2. Trace identity from the session cookie to the request-scoped user database. Verify every user-data endpoint is authenticated and scoped to that database.
3. Check SQL binding, CSRF/session cookie assumptions, password/session handling, errors/logging, reverse-proxy HTTPS behavior, container user/data permissions, and Android cleartext policy.
4. Run `govulncheck ./...` and relevant unit/integration checks when asked or when part of a requested change.
5. Report confirmed issues separately from hardening opportunities, with severity and a concrete fix. Never expose secrets or claim a scan ran without evidence.
