# Decisions

Why JitterBug works the way it does. What the app does is in [`SPEC.md`](../SPEC.md); this file says **why**, and what else was considered. Newest additions go at the end of their section. The questions still open are at the bottom.

---

## The app as a whole

### One program, one SQLite file per person
JitterBug is one Go program with the web app built into it, and SQLite for data. There is nothing else to install or keep running, and a backup is copying files. Each person gets their own database file, so one person's data can't leak into another's screens even if a query forgets a filter, and one person's data can be backed up or handed over as one file. A `user_id` column on every table was rejected: one missed filter would leak data.

### Pure Go, no C compiler
`modernc.org/sqlite` is SQLite rewritten in Go. It builds anywhere, including for the phone, without a C toolchain. Don't swap it for `mattn/go-sqlite3`.

### The server does every calculation
Ages, points, progress, totals and so on are worked out in one place (the Go code) and sent to the screens. If the web page, the phone and the server each did their own maths, they would slowly disagree.

### Charts built in, not Grafana
Grafana was considered and rejected:
- It is a second program to run, update and back up.
- Showing its panels inside the app needs security workarounds. Each one either removes access control or puts a token in a link anyone can copy. Failures show up as broken panels, not clear errors.
- It is built for monitoring: alerts, thresholds, red means bad. This app deliberately avoids all of that.

The dashboard uses react-grid-layout (the grid Grafana itself was built on) and Recharts. If shared dashboards or alerting are ever wanted, this should be looked at again.

### All energy types are equal (Change 001, 2026-10-30)
Energy types used to be split into "spend" (work) and "restore" (rest). That quietly ranked work above everything else, as if rest only existed to refuel for more work. Now there are just types, every type earns points, and the rule is: types are never subtracted from or divided by each other. Adding them up is fine. The old `direction` column stays in the table, because migrations only add, but nothing reads it.

### Points are stored when a session is logged
A session's points are saved with it, instead of being worked out when read. That way changing a rate is a choice about the future and never rewrites history. Editing what the points depend on (hours, intensity, energy types, shares, task) does recalculate them (Change 002), because old points would no longer describe the session. Rate changes don't, unless you ask with **Recalculate**.

### The points formula
- **Sessions:** hours × the type's points per hour × intensity. The owner chose hours × intensity (2026-10-30). With every rate at 1 per hour this gives the same numbers as before rates existed.
- **Tasks:** intensity × priority weight. The owner confirmed this (2026-11-04).

### Intensity, not difficulty
"Difficulty" didn't fit a game, a workout or a hard conversation, so the word shown is **intensity**: Light, Moderate, Intense, Very intense, Extreme. Only the words changed. The database and API still say `difficulty`, and nothing was recalculated.

---

## Tasks and boards

### Keys count up from the highest number ever used
The next key is the prefix plus one more than the highest number ever used with it, deleted tasks included, worked out while the task is being saved. Keys are never reused. Counting by prefix, not by area, means moving a task between areas doesn't disturb numbering.

### Dates come from the move log, worked out in Go
The first spec asked for a saved SQL query (a "view") called `task_dates`. It wasn't built. All the dates (first started, completed, ages, time in status) are worked out by `deriveDates` in `internal/db/derive.go`. Having the SQL view too would mean two calculations that could disagree.

### "Completed" is when the current run of done started
Completed is when the task entered a done status from a not-done one, as long as it is still done. Moving from Done to another done status keeps the date. Leaving done clears it. Cancelled works the same way.

### Moves don't check for conflicts, and reordering doesn't count as an edit
A move takes no "last changed" time: the last move wins. A status change counts as a change to the task, but reordering inside a column doesn't. Otherwise dragging cards around would make a task panel open in another tab fail to save.

### Renumbering a column
The column is renumbered when a card dropped between two others would land within 0.000001 of a neighbour, not only when neighbours are already that close. Otherwise one more drop could break the rule.

### Swimlanes don't allow dragging between lanes
Dragging a card into another lane would quietly change its epic or priority, which is easy to do by accident. Changing it is one click in the task panel.

### Deleting something in use: the Jira way (owner, 2026-11-04)
Before, areas couldn't be deleted while used, statuses and priorities asked where to move tasks, and energy types and subtypes were hidden while old records still pointed at them. Now they all behave like Jira: if something uses the item, the app says what and asks where to move it, then deletes. Nothing is ever left pointing at a deleted item. "Refuse until you fix it yourself" was the other option. It was rejected because it makes you edit every task by hand.

### Deleted list items are renamed
Deleting a status, priority, energy type, subtype or area hides it and renames it `name [deleted #id]`. Names must be unique, so without this a deleted "Blocked" would stop you ever making a new "Blocked". Old records still find the row by its id.

### Status categories are really deleted
A status category has no "deleted" column, and an unused one is referenced by nothing, so deleting one removes it.

### Epic totals are worked out, not stored
An epic's logged hours and summed estimates are computed when read. Stored totals would go wrong with every session edit. Which columns an epic's panel shows is one setting (`epic_columns`) shared by every epic, because a choice per epic would be a setting nobody remembers making.

### A subtask has no epic of its own (owner, 2026-11-04)
A subtask belongs to its parent's epic, and its hours count in that epic's total. Letting subtasks pick their own epic would be confusing.

### Parent hours (owner, 2026-11-04)
A parent shows its own logged hours, and below them the total with its subtasks. Showing only one of the two hid information.

### Progress can pass 100% (owner, 2026-11-04)
Logging more than the estimate happens. The bar turns red and says by how much, instead of stopping at 100% and hiding it.

### Backfilled start dates (owner, 2026-11-04)
Tasks already in progress before start dates existed got the day they first moved into progress, taken from the move log (migration 017).

### Duplicate search reads descriptions too (owner, 2026-11-04)
Descriptions are matched by words, scored on their own, and ranked just below the same match in a title. Mixing a long description into the title's score would let it drown short titles. Matching by meaning still uses titles only: a second meaning vector per task would double the work.

### Unfinished parts are hidden, not deleted (owner, 2026-11-04)
The Stuck view, the Stuck work widget and Drift aren't designed yet. They are hidden (and Drift can't be added as a new widget), but their code and saved settings stay for the next phase. The owner's rule: when told to "remove" something unfinished, hide it, or mark it clearly as not finished.

---

## Sessions, day screen, states

### Session edits: the latest change of each field wins (owner, 2026-11-04)
Tasks warn when you save over a change made elsewhere. Sessions don't. Each field keeps its latest change, between tabs and devices, the way Todoist does it. Sessions still record when they last changed (`updated_at`, set by a small database rule on every change). The other option was to warn like tasks; it was rejected because it sometimes makes you redo an edit for little benefit.

### Session hours: more than 0, at most 24
This stops a typo like 25 or 250.

### The capture button sits in the sidebar
The first spec put it at the bottom right. There it covered the last board column, its cards and the scrollbar, so it moved to the sidebar header. It is still on every screen, and Ctrl/⌘+K still works.

### Capture never guesses between task and session
When the AI hasn't decided (or there is no AI), the form shows Task / Session with neither picked. It costs one click, but avoids a silent wrong guess. The owner confirmed this (2026-11-04).

### Capture: one interface, any OpenAI-compatible model
The model is called with one plain HTTP request, temperature 0, asking for JSON. Every name it returns is checked against your real lists; anything unknown becomes empty. It picks from up to 8 open tasks found by shared words in SQLite, so it can't invent task keys. Vendor libraries were rejected because they add dependencies for one request.

### Buff and debuff colours (owner, 2026-11-04)
A debuff is a warning, so it goes from yellow (mild) to red (severe). A buff goes from blue (mild) to green (strong). The earlier plan avoided red altogether ("no red means bad"); the owner chose this instead.

### Starting rates
Every energy type starts at 1 point per hour. The owner confirmed this (2026-11-04).

---

## Accounts and security

### The first person becomes admin, and there is no open sign-up
Setup works only while there are no accounts, so a stranger can't take over a running server.

### Sign-in
- **Cookie:** a random token in an HttpOnly cookie. Only its fingerprint (sha256) is stored. It lasts 30 days and is renewed while used.
- **Passwords** are bcrypt. Unknown usernames still do a bcrypt check, so the timing doesn't reveal which names exist. The fixed dummy hash for that is written into the code, so start-up doesn't spend about 100 ms making one on a phone.
- **Lockout:** five failures lock a username for 15 minutes.
- **Other websites:** a request that changes data and comes from another website is refused.

JWTs were rejected because they can't be revoked without a table anyway.

### An old single-user database is adopted
If an old `jitterbug.db` exists when the admin is created, it becomes the admin's data, untouched. Upgrading never loses or rewrites data.

---

## Storage and speed

### Migration version in SQLite's header
The applied version is kept in `PRAGMA user_version`, saved together with the migration. No extra table.

### Times are fixed-width UTC text
Times look like `2026-10-29T10:00:00.000000000Z`. Fixed width means sorting the text sorts by time, and two writes in the same millisecond still get different values.

### One connection per database, writes one at a time
With one person per file, doing writes one at a time is plenty fast, and it makes key numbering safe without retry loops.

### Edits send only what changes
Missing means "leave it", null means "clear it". Custom fields merge key by key, so a client never deletes values it didn't know about.

### Metrics are worked out in Go over plain queries
Week starts depend on a setting, subtypes carry rank weights, and task dates come from the move log. Doing all of that in SQL would copy `derive.go`. Tests check every metric against hand-written SQL.

### Custom fields get an index each (owner, 2026-11-04)
Storage is cheap, so every custom field gets its own index and filters stay fast. The field's key is written into the query text so SQLite uses the index. Keys can only be letters, digits and `_`, so this is safe.

### Reusing a deleted custom field key (owner, 2026-11-04)
Before, a deleted field's key could never be used again, because its data was kept. Now using it again removes the old field and its values for good, so the new field starts empty. This honours what the person chose.

### Compression and caching
The web app is compressed once at start-up. Files with a version in their name are cached by the browser for a year; the page itself is checked each time. API answers are compressed. A first load on a home network went from about 550 ms to 310 ms.

### Fewer reloads
A view reloads its tasks only when its filter, search or data change, not when layout or grouping is saved or a panel closes with no edit.

### Chart libraries
react-grid-layout 1.5.4 (1.5.0–1.5.3 shipped a stray binary in the package; 2.x rewrote the API) and Recharts 2.15.4. They load only with the dashboard screen, keeping about 475 kB out of the board's first load.

### Colours
The dark palette was checked against Atlassian's and GitHub's published dark themes and Material Design's guidance. All text passes the WCAG AA contrast rule. Coloured status labels are lightened only as far as needed to stay readable.

### Readable grey text in every theme (owner's UI review, 2026-11-04)
WCAG AA asks for a contrast of at least 4.5 to 1 between text and its background. A theme's two grey text colours (`muted` and `subtle`) are now checked when the theme loads, against the page, cards, columns, menus and hovered cards. If one falls short, it is moved toward the main text colour just far enough to pass; a passing colour is left as it is. The saved theme is never changed, only what is shown. Why: the built-in themes passed on plain cards, but GitHub Dark Dimmed's grey on a hovered card measured 4.1:1, and an uploaded theme can be anything (the review found one at about 3:1).

### A task's symbol is a page, not a ticked box (owner's UI review, 2026-11-04)
Tasks used Jira's blue ticked box. On a task that isn't finished, a ticked box reads as "done", so it is now a blue page symbol. The subtask count on a card says "2/5 subtasks" instead of "☑ 2/5" for the same reason. Small icon buttons (sidebar, column collapse, column limit, quick capture, the buttons on a hovered card) get a click area of at least 32 by 32 pixels; the web app is for desktops, so the 44-pixel touch size isn't used.

### Time zone per person (owner, 2026-11-04)
"Today" used to be the server's day, which can be wrong near midnight when the server runs in UTC. Now the browser and the phone send their time zone, and the server uses it.

---

## The phone and sync

### Kotlin and Compose, with JitterBug's own Go inside
The owner compared demos and chose Kotlin + Jetpack Compose + Material 3. The app runs the same Go code as the server, built as an Android library with `gomobile bind` and called directly inside the app (no separate server process). It opens in about 30–50 ms and works with no network. Rewriting the logic in Kotlin would save about 15 ms per screen, but would create a second copy of every calculation, so Go stays.

### Local first, sync optional (Change 003, 2026-11-04)
A phone app that needs a server first is useless to someone without one, and on a train for someone with one. So the app works on its own, and a sync server can be added later, with no modes to choose. Devices only sync through a server.

### How sync is built
- **Record IDs** live in one lookup table (`sync_idmap`) instead of a new `uid` column on 17 tables. It means the same thing, changes no existing table, and keeps the ID of a deleted row for its "deleted" marker.
- **Only the latest change of each field is kept** (`sync_field`), not a growing log of every operation. So there is nothing to trim, and no device ever needs to be "forgotten" after 90 days. A new device gets a full copy straight from the tables.
- **Changes are recorded by database rules (triggers)** made by the Go code from one table list on every start. That catches every write from every code path, and a new column needs no extra work.
- **Built-in records have fixed IDs**, so every device's "Backlog" is the same record. Built-in widgets are named by dashboard and title, because three migrations added them and their row numbers differ between databases.
- **On an exact tie** (for example built-in rows retired by a migration at slightly different moments), every device keeps the greater value, so they still agree.
- **The phone's networking is in Kotlin.** The Go code produces what to send and applies the answer, and Kotlin carries it over the network. That avoids Go networking inside an Android app.

### The 16 KB fix for the phone library
Newer Android phones use 16 KB memory pages, and Google Play requires native libraries laid out for them. The Go library is now built that way (one linker option in `mobile/build.ps1`). It changes nothing about how the app works.

### The phone's own account "me"
The built-in Go code needs an account to sign in to, so the phone has one called "me" with a hidden random password. Connecting a sync server copies the phone's data into your server account. Several accounts per app aren't needed (owner, 2026-11-04).

### Download database
A clean copy is made with SQLite's `VACUUM INTO`, so changes still waiting in the write-ahead log are included, which a plain file copy could miss.

---

## Open questions

- **"Too low" on the ceiling question.** It only cancels a "too high" hold. Should it suggest more hours for the next days?
- **Built-in statuses.** All five seeded statuses are built in, so none can be deleted. Should any of them be deletable?
- **Cancelled tasks can't be snoozed.** They are already off the board, so snoozing would hide nothing. Allow it?
- **Who counts as incomplete.** Only open tasks of type task; done, cancelled, epics and snoozed tasks never do. Confirmed as correct, kept here as a reminder.
- **Card "subtypes"** shows the subtypes of sessions logged on a task (tasks have none of their own). Is that the right meaning?
- **Deleting an area keeps its board view.** Should the view go with the area?
- **Sync gaps.** Background images and the capture API key don't sync yet. The key should sync encrypted, with a key made from your username and password (Change 003 item 17). The phone's device ID is random rather than "account + phone model + random".
- **A flaky test.** `TestPatchTaskConflict` can fail when two edits land in the same millisecond. It is older than sync.
- **The Jira import** maps worklogs to each area's default energy type (Main job and Freelance → Engineering, Personal → Admin). Check before importing.
