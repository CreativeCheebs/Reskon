# JitterBug — Change 003: Local first, sync optional

Nov 4, 2026 · @Aakash Kumar · Applies to: Phase 1 build spec §9 "Sync and offline" (replaces "Server-authoritative, online-only for writes"); Phase 2 build spec where it assumes one server

**Status: draft.** Open questions answered Nov 4, 2026. Ready for review.

## Summary

Every JitterBug works on its own. The Android app opens straight into your data, with nothing to set up, no account and no network. It keeps everything on the phone and works fully offline, for good.

Later, if you want, you enter a **sync server** in Settings, which is your own JitterBug server. From then on the phone and the server swap changes whenever they can reach each other. The web app is the server's own copy, so anything done on the phone shows up there, and the other way round. More devices can join the same way.

There are no modes. An app with a sync server is the same app, plus syncing.

## Why

- A phone app that needs a server first is useless to someone who has no server, and useless on a train for someone who does.
- Asking "offline or server?" on first launch forces a choice before the person knows what it means. Adding sync later costs them nothing.
- Every number has to come out the same everywhere. Each device runs the same Go code (the server built for Android), so points, readouts, cycle time and metrics are computed by one implementation, never a second copy in Kotlin.

## What changes

1. **Every device has a full local database.** The phone runs the JitterBug Go core with its own SQLite file, the same schema as the server. The app's screens only ever talk to this built-in core, never to the sync server directly, so reads and writes are local and instant, whether or not there is a network. Sync is a background job between the built-in core and the sync server.
2. **Every change is also an operation.** Each write (create, field change, move, delete) appends a row to a local **operation log**: which record, which fields, the new values, the device, and a clock stamp. The tables stay as they are; the log is what syncs.
3. **Records get a global id.** Synced tables gain a `uid` column (a UUID), added by an additive migration. Local integer ids stay and still drive the API and the UI; `uid` is how two devices agree they mean the same record. Built-in defaults (the starting statuses, energy types, priorities) get fixed `uid`s, so every device's "Backlog" is the same record.
4. **Sync is push then pull.** A device sends the operations the server hasn't seen, then fetches the operations it hasn't seen since its last sync token, and applies them. It runs on opening the app, a few seconds after a change, every few minutes while open, and from **Sync now**. A failed sync just waits for the next one. Nothing on the device is ever blocked by it.
5. **Conflicts: the last change wins, per field.** If the phone renamed a task and the web changed its priority, both changes stay. If both renamed it, the later rename wins. "Later" uses a hybrid logical clock, so a phone with a wrong clock can't win forever.
6. **History merges, it doesn't conflict.** The status transition log is append-only on every device, so syncing takes the union. A task's current status is the one from its latest transition. Two offline moves both stay in history, and the later one decides where the task is now.
7. **Sessions are mostly new rows**, so they rarely conflict. Their stored points travel with them, as raw data (Change 002), so the number shown is the one earned when logged, on every device.
8. **Derived values are computed on each device** from the synced raw data, by the same Go code. They are never synced.
9. **Deletes leave a tombstone** in the log, so a delete on one device isn't undone by an old copy on another.
10. **The server is also the sync server.** The existing JitterBug server gains a sync endpoint per account (`POST /api/sync`: send operations, receive operations and a new token). Its accounts, sign-in and per-user databases are unchanged. The web app keeps working against it directly, online. Its writes go into the same operation log, so devices receive them.
11. **Connecting a device that already has data merges the two**, as a union. Nothing is thrown away. The same record can't be on both sides unless it came from sync before, so nothing collides except task keys (below).
12. **Task keys can collide.** Two devices offline can both create `JB-13`. The first to reach the server keeps the key. The later one is renumbered to the next free number on arrival, and its old key stays findable in search and in the task's history. Keys only show in the task panel, so this is rare and visible in one place.
13. **The phone shows sync state, quietly.** Settings shows the server, the last sync time and the last error. A small marker shows when there are unsent changes. No banners, and no actions are disabled offline.

14. **Leaving sync keeps everything.** A device that disconnects keeps working with the data it has at that moment, on its own. It can later connect to the same or another server, which merges as in item 11.
15. **One person per account, several accounts per app.** Nobody shares an account. The app can hold more than one account, each with its own database, like the server. Each account on each device gets a **device id** that is unique across all devices: the account's id, the phone model and a random part made once at install. The model alone isn't enough, because two people can own the same phone. Operations carry this id.
16. **Dashboards and settings sync.** Two dashboards with similar names can exist side by side, for example one arranged for the phone and one for the desktop. Which one each device opens is a per-device choice, and that choice doesn't sync.
17. **LLM settings and keys sync, encrypted.** Secret settings (the API key) are stored and synced encrypted, never in plain text. The key that encrypts them is derived from the account's username and password with a slow key-derivation function and its own salt. It is never the stored password hash, because that lives in the same database and a leaked copy would carry its own key. The key exists only in memory, on a device after sign-in and on the server during a signed-in session, so every device needs the same username and password. Changing the password re-encrypts the secrets. Forgetting it means entering the LLM key again, and nothing else is lost.
18. **Board order can't flicker.** Card order is a number per card. When two devices reorder the same column offline and then sync, every card keeps the position it was last given, which can mix the two orders, or give two cards the same number. Ties are broken by `uid`, so every device shows the same order. Anyone who wants it different just drags again.
19. **The operation log is trimmed, not kept.**
   - **On a device:** an operation is deleted as soon as the server confirms it received it.
   - **On the server:** the log is trimmed up to the point every device has reached. For example, if there are 15 operations and the device furthest behind has fetched 10, the first 10 are deleted and 5 are kept. A device that hasn't synced for 90 days is forgotten and stops holding up the trim.
   - **A full copy:** a new device always starts by downloading the account's current data, not by replaying the log. A forgotten device that comes back is treated as new: it downloads a full copy, then sends its own unsent changes on top. Even years of data (tens of thousands of tasks and sessions) is a few megabytes.
   - History of what happened (status transitions, sessions) is data, not log, and is kept as before.

## What stays

- Optimistic concurrency (`updated_at`, 409) inside one device still protects two tabs on the web app.
- Status changes still only go through `db.Move`, which writes the transition in the same transaction. A synced move is applied the same way.
- Each user's data is still a separate database. Sync only ever touches the signed-in user's own.
- Every rule in AGENTS.md: derived values on read, energy types equal, metrics as a registry, and capture that never fails.
- A server without any devices works exactly as today.

## Not in this change

- Syncing devices with each other without a server. Never planned: devices only ever sync through a sync server.
- A Windows or desktop app.
- Sharing data between different users.
- Undoing or comparing conflicts by hand.

## Decided

- Disconnecting: the device keeps its data and keeps working (item 14).
- People: one per account, with several accounts per app (item 15).
- Dashboards and settings: they sync, and per-device variants are a choice (item 16).
- LLM key: it syncs, encrypted with a key from the username and password (item 17).
- Board order: last write wins, with ties broken by `uid` (item 18).
- Operation log: trimmed once synced (item 19).
