# Decisions

Why Reskon works the way it does. What the app does is in [`SPEC.md`](../SPEC.md); this file says **why**, and what else was considered. Newest additions go at the end of their section. The questions still open are at the bottom.

---

## The app as a whole

### One program, one SQLite file per person
Reskon is one Go program with the web app built into it, and SQLite for data. There is nothing else to install or keep running, and a backup is copying files. Each person gets their own database file, so one person's data can't leak into another's screens even if a query forgets a filter, and one person's data can be backed up or handed over as one file. A `user_id` column on every table was rejected: one missed filter would leak data.

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

### Intensity, not difficulty (superseded 2026-11-13: it is now called Level)
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
- **Lockout:** five failures lock a username for 15 minutes, **for the computer that failed** (the key is name + address), and thirty failures lock one address whatever names it tries. This stops a stranger locking the admin out by typing wrong passwords, and it keeps the list of failures from growing without limit. Behind a reverse proxy the address would always be the proxy, so `JITTERBUG_BEHIND_PROXY=1` makes the server use the last address in `X-Forwarded-For` instead. A determined attacker with many addresses is not stopped; a long password is the defence. If a proxy is there but `JITTERBUG_BEHIND_PROXY` is not set (requests carry `X-Forwarded-For`), every client would look like the proxy, so the per-address limit switches itself off and a warning is logged once; only the per-name limit applies, as before.
- **Setup token (optional):** `JITTERBUG_SETUP_TOKEN` must be sent with the first-run setup. It is off by default so existing installs and the container keep working; the server warns in its log while setup is open.
- **Secure cookie:** the session cookie is marked Secure when the request is HTTPS or the proxy says so. `JITTERBUG_SECURE_COOKIE=1` forces it. It is never forced by default, because the plain-HTTP home network would then lose its sign-in.
- **Errors:** a 500 reply says "something went wrong" and the details go to the server log only, since they can contain SQL and file paths.
- **Server limits:** the server gives a client 10 seconds to send its request headers and closes idle connections after 2 minutes. There is no overall read/write timeout, because a phone's first sync moves many megabytes. Expired login sessions are deleted once an hour.
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

### A task's symbol is a page, not a ticked box (owner's UI review, 2026-11-04) — superseded 2026-11-13: it is an outlined tick-box again
Tasks used Jira's blue ticked box. On a task that isn't finished, a ticked box reads as "done", so it is now a blue page symbol. The subtask count on a card says "2/5 subtasks" instead of "☑ 2/5" for the same reason. Small icon buttons (sidebar, column collapse, column limit, quick capture, the buttons on a hovered card) get a click area of at least 32 by 32 pixels; the web app is for desktops, so the 44-pixel touch size isn't used.

### The task symbol is an outlined tick-box again (owner, 2026-11-13)
The blue page symbol (2026-11-04) did not look good. Tasks now use an outlined tick-box in the accent colour, close to Jira's, in the same places as before; epics keep their lightning bolt. It is drawn as an outline, not a filled tick, so it does not read as "done". Nothing else about the 2026-11-04 entry changed (the subtask count still says "2/5 subtasks").

### One version number (owner, 2026-11-13)
The owner asked for a version to be kept, shown in Settings and in the commits. It is `major.minor.patch` in a `VERSION` file, starting at 0.2.0 (the phone app was 0.1.0). The server and web app share it; the phone's Gradle build reads the same file, and each release is tagged `v<version>` in git. A test fails if `VERSION`, `internal/version/version.go` and `web/package.json` disagree. The health check now also says the version, so the phone can show which server it is connected to. Nothing is checked when a phone and a server of different versions sync; sync already tolerates unknown fields.

### No "Board as a list" on the phone (owner, 2026-11-13)
The first version of item 7 added a phone-only switch that drew the Board layout as one list with a section per status. The owner then pointed out that it looked the same as the List layout, so there were two layouts that did the same thing. It was taken out again: Board is always columns, List is the vertical list. What stayed from that round: hidden statuses (Backlog, Cancelled) are left out of the List layout until their button is tapped, and Settings › Statuses on the phone has the *Show on the board* switch.

### Tags (owner, 2026-11-13)

The owner asked for tags like Jira's labels: several per task, beside areas and epics, also on sessions, picked by the capture model from the tags that exist, and shown in filters, cards, capture and on the phone. Migration 018 adds `tag`, `task_tag` and `session_tag` and nothing else.

**A session's tags are worked out, not copied.** The owner's rule was that a task's tag change reaches its sessions unless the session's tag was put on by hand. That is the same as "a session shows its task's tags as they are now, plus its own", so only the hand-made ones are stored (`session_tag`) and the rest is worked out when the session is read (as AGENTS.md asks of derived values). This also means nothing has to be rewritten, locally or through sync, when a task's tags change. A tag the session has by hand *and* its task also has shows as the task's; if the task loses it, the session keeps it. Detaching a session from its task drops the inherited tags (the owner did not say; this is the least surprising).

**Tags are only a name.** No colour for now (the owner did not ask). Names are case-insensitive and unique, so "Backend" and "backend" cannot both exist.

**Sync.** A tag's record id is made from its lower-case name, and a task's tag from the task's and the tag's ids, so the same tag or link made on two devices merges instead of failing on the unique index (the way custom fields already do). A session's own tags travel as one value of the session, like its subtypes. Deleting a tag removes its links. The tag and link tables use AUTOINCREMENT, because these rows are really deleted: without it SQLite hands the highest id out again, and the new row would inherit the dead row's sync record and reach other devices as a deletion. A session naming a tag the receiving device already deleted is skipped, not an error, so it cannot block a device's sync. A view's tag filter holds tag ids, which are swapped for uids between devices like its areas and epics. The tests cover two devices doing each of these (and fail without each fix).

**Known limit.** Two devices that, while apart, rename a tag to a name and create a different tag with that name end up with two tag records that want the same name; the second cannot be added (names are unique), so its links are dropped on the other device and its rename keeps being refused. Rare (it needs a rename and a new tag with the new name before either syncs), and nothing is corrupted; a person can rename one of them. An older server or phone that does not know tags refuses to open a view whose filter has a tag (it rejects the unknown filter key); the other views are fine.

### Time zone per person (owner, 2026-11-04)
"Today" used to be the server's day, which can be wrong near midnight when the server runs in UTC. Now the browser and the phone send their time zone, and the server uses it.

---

## The phone and sync

### Kotlin and Compose, with Reskon's own Go inside
The owner compared demos and chose Kotlin + Jetpack Compose + Material 3. The app runs the same Go code as the server, built as an Android library with `gomobile bind` and called directly inside the app (no separate server process). It opens in about 30–50 ms and works with no network. Rewriting the logic in Kotlin would save about 15 ms per screen, but would create a second copy of every calculation, so Go stays.

### Local first, sync optional (Change 003, 2026-11-04)
A phone app that needs a server first is useless to someone without one, and on a train for someone with one. So the app works on its own, and a sync server can be added later, with no modes to choose. Devices only sync through a server.

### First start and the first download (owner, 2026-11-04)
The owner asked for two things. First, a choice at first start: connect to a server now, or use the phone offline and connect later. Second, connecting for the first time should be a full download that the app waits for, with a percentage, rather than a quiet background sync. This replaces "there are no modes; nothing on the phone ever waits". Only the first download waits. Later syncs still run in the background.

- **How the percentage is measured**: the server's answer is compressed on the way, and the phone unpacks it as it reads. So the server sends the size before compression in an `X-Sync-Size` header, and the phone counts unpacked bytes against it. An older server without the header gets a moving bar with no number.
- **The download is saved in one go** (one database transaction), so an interrupted download leaves nothing half-written. The phone remembers whether the first download finished (`first_done`), and starts it again until it has.
- **The first download allows 5 minutes** for the server to answer, instead of 15 seconds, for slow links such as Tailscale through a relay.

### How sync is built
- **Record IDs** live in one lookup table (`sync_idmap`) instead of a new `uid` column on 17 tables. It means the same thing, changes no existing table, and keeps the ID of a deleted row for its "deleted" marker.
- **Only the latest change of each field is kept** (`sync_field`), not a growing log of every operation. So there is nothing to trim, and no device ever needs to be "forgotten" after 90 days. A new device gets a full copy straight from the tables.
- **Changes are recorded by database rules (triggers)** made by the Go code from one table list on every start. That catches every write from every code path, and a new column needs no extra work.
- **Built-in records have fixed IDs**, so every device's "Backlog" is the same record. Built-in widgets are named by dashboard and title, because three migrations added them and their row numbers differ between databases.
- **Nobody knows when it changed: the server wins.** Rows from before sync existed have no "last changed" time on any side. When the two sides disagree on one of these, the server's value wins, on the server and on every device. Before this rule (2026-11-04), the "greater" value won instead, and a new phone's untouched defaults replaced the owner's "Job" view settings and Today widget layout on the live server (`TestSyncServerWinsUnstampedBuiltIns`).
- **On an exact tie with a known time** (for example built-in rows retired by a migration at slightly different moments), every device keeps the greater value, so they still agree.
- **The phone's networking is in Kotlin.** The Go code produces what to send and applies the answer, and Kotlin carries it over the network. That avoids Go networking inside an Android app.

### Snoozed and blocked tasks on the phone (owner, 2026-11-07)

A task snoozed on the desktop still showed on the phone. Sync was fine (every task column, including the snooze day, already syncs); the phone's Board screen simply never hid tasks marked snoozed, while the web does. Blocked tasks had the same gap. The phone now splits the view's tasks as the web's view screen does (`splitTasks` in `ListState.kt`, which only reads the server's `snoozed`, `blocked` and `missing` flags) and shows the three joined buttons Snoozed, Blocked and Incomplete only when they have tasks. Wake labels and the Snoozed order follow the web (`wakeLabel`, `snoozedOrder`). The phone's Blocked switch writes the view's whole `board_state` back with one key changed, because the server replaces that object instead of merging it (`boardStateWith`).

Two things the owner should know. (1) After updating, blocked tasks leave the phone's lists, because views that never chose "hide blocked" default to hiding them, as on the web. (2) A done task that still has an open blocker is counted as blocked (the server rule, same on the web), so it leaves the Done list under that default.

The owner approved the first touch-target fix with this change (2026-11-07): the choice sheets (Snooze, Move to, Views, Pick a task) have rows at least 48 dp tall. The test that checks 48 dp reads a control's own size, not the touch area Compose widens around small controls, and a test proves it fails for a 24 dp control. The rest of the touch-target work still waits for the agreed mockups.

### The Day screen is optional (owner, 2026-11-07)

The owner rarely uses the Day screen. One account setting, `show_day_screen`, decides whether it is offered: a switch in Settings › Screens on the web and on the phone, off by default for everyone, synced like any setting so both agree. The server only checks that it is `true` or `false` (`internal/db/screens.go`). Off hides Day from the web sidebar and the phone's Today tab; nothing is deleted. After updating, Day disappears for existing accounts until switched on. An old `#/day` link opens the first view. The phone opens on Board, and leaves Today if the setting is turned off while it is open.

Checked end to end on the test server and spare phone: switching it on or off on the phone reaches the server, and switching it on or off on the server reaches the phone on its next sync.

### "Intensity" is now "Level", and "Work" is now "Task" (owner, 2026-11-13)

The words Light, Moderate, Intense, Very intense and Extreme did not fit rest and play ("a good nap is not extreme"), so the 1 to 5 scale is just **Level 1** to **Level 5**. Nothing in the data changes: it is still `difficulty` and the same numbers, so old data, points and sync are untouched. The symbols changed from circle-to-hexagon in blue, green, yellow, orange and red to one to five slanted lines in a pale-to-deep-blue ramp (`difficulty1` to `difficulty5` in each theme). Red was dropped on purpose, because it reads as a warning. The line count carries the number, so colour is never the only signal. The phone shows the number with a coloured slash count in the session form and a coloured number elsewhere. Charts no longer borrow the level colours for their series; they use the danger colour instead. The capture model's prompt still describes the 1 to 5 scale in words, because that is how a person writes ("it was intense"); only the screens changed.

The session switch says **Task** or **Event** (it was Work or "Event (not work)"), with no hint line.

### Tasks and epics can be renamed on screen (owner, 2026-11-13)

The owner wanted a better word than "task" (Todo was an idea) and said it should be a setting, so each person picks their own. One account setting, `terms`, holds up to four words (task, tasks, epic, epics); anything missing means the default. It syncs like any setting, so the web and the phone agree. The server checks the shape and the characters and trims the words (`internal/db/terms.go`), nothing else.

Only what is displayed changes. API field names, the database, task keys, server error messages, the spec and the capture model's prompt keep the words task and epic, so a rename can never break sync or an old phone. Words are stored as typed in the lower case wanted mid-sentence and only the first letter is raised at the start of a label, so "ToDo" is never turned into "Todo". Screens avoid putting "a" or "an" in front of a name ("New task", not "Add a task"), because the right one depends on the word. This is why a few sentences were reworded.

Settings › Names on the web, and Settings › Names on the phone.

### The app is called Reskon, and the phone release is signed (owner, 2026-11-08)

The product name shown to people is now **Reskon**: the phone app's name, the web page title, sign-in page and sidebar, the messages, and the docs. Names that only the code sees were left alone on purpose, because changing them would break things and show nothing: the Go module and the `jitterbug` program, the folder names, `jitterbug://` links (the tests use them over adb), the phone's data folder and the Kotlin package `com.aakash.jitterbug`. The owner can rename those later as a separate change.

The phone app's id (what Android calls the app) is now `com.aakash.reskon`. Android installs it next to the old JitterBug app instead of over it, so the old app and its data stay until the owner removes them (a server-connected phone just syncs again). It also could not have updated in place anyway: the old app was signed with the debug key, and the release is signed with the Reskon key.

The release is signed with the key in `X:\Personal\Keys` (`reskon-release.jks`, alias `reskon`; the passphrase is in `reskon-passphrase.txt` beside it). Neither is in the repo. `mobile/release.ps1` reads them for the build only, builds `Reskon-<version>.apk`, checks with `apksigner` that it carries the Reskon key's fingerprint, and copies it to `/home/aakash/apks/` on the Linux machine. Without the key the release build is left unsigned instead of falling back to the debug key. Keep a copy of the key and passphrase somewhere safe: an app signed with a lost key can never be updated, only replaced.

### The 16 KB fix for the phone library
Newer Android phones use 16 KB memory pages, and Google Play requires native libraries laid out for them. The Go library is now built that way (one linker option in `mobile/build.ps1`). It changes nothing about how the app works.

### The phone's own account "me"
The built-in Go code needs an account to sign in to, so the phone has one called "me" with a hidden random password. Connecting a sync server copies the phone's data into your server account. Several accounts per app aren't needed (owner, 2026-11-04).

### Scratch data stays in memory (2026-11-04)
SQLite sometimes needs a scratch file, for example to sort a big result or to undo part of a large change. On a computer it puts that in the temp folder. Android has no temp folder that SQLite can find, so on the test phone creating a task failed with "disk I/O error" (code 6410, `SQLITE_IOERR_GETTEMPPATH`), and a first sync could fail the same way. Every database is now opened with `temp_store = MEMORY`, so scratch data is kept in memory instead. The server does the same. Its data is small, and memory is faster than a file anyway.

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
- **A flaky test (owner: accepted).** `TestPatchTaskConflict` failed once on Windows when its two edits landed in the same clock tick, because the test makes them microseconds apart. The owner's view: two real edits to one task never land in the same millisecond, so this is a test-only quirk and nothing is changed. It is older than sync.
- **Capture endpoint reach.** A signed-in person can point capture at any address, including one on the home network, because a local model (Ollama, LM Studio) is the normal use. The server no longer hands them its key, follows redirects or shows what the address answered, but it will still send the request. Blocking private addresses would break local models; restricting the endpoint setting to admins would be the alternative.
- **HTTPS everywhere (owner decision, not built yet).** Give up plain HTTP. Two ways to run the server, both on the Linux machine: (1) after each commit, pack it in a Docker image and run it behind **Caddy**, which serves HTTPS; (2) without Docker, run the binary with **HTTPS and a self-signed certificate**, made fresh when needed. Either way the web app and the phone talk HTTPS only. To build: the phone must trust the certificate (Android's network config can pin one), the phone's default for a bare address becomes `https://`, `JITTERBUG_SECURE_COOKIE=1` becomes the default, and `usesCleartextTraffic` goes away. Docker runs only on the Linux machine, never on the Windows build PC.
- **Full Content-Security-Policy.** Only `frame-ancestors 'none'` is sent, plus nosniff, no-framing and a same-origin referrer. A full policy needs testing in a real browser against Ant Design's inline styles.
- **Dark only.** The web app and the phone app have only a dark look. Is a light theme wanted?
- **Touch targets under 48 dp on the phone (owner: do with mockups).** Pills, tags and icon buttons are smaller than Android's 48 dp guide. Draw mockups first, then change the sizes, so the layouts are agreed before any code moves.
- **Border and hard-coded colours (owner decision).** `borderStrong` is about 2.1:1 against the background (3:1 is the guide for a control's outline), and a few colours are written as fixed values. The fix is to change the colours **inside each theme**, not to add code around themes. The theme system itself stays as it is.
- **Session totals on the server.** The Sessions screen adds up hours in the browser for the "in total" line, and the Inbox works out ages from the clock. AGENTS.md says totals come from the server; moving them needs an API change.
- **The Jira import** maps worklogs to each area's default energy type (Main job and Freelance → Engineering, Personal → Admin). Check before importing.
