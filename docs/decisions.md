# Decisions

Why Reskon works the way it does. What the app does is in [`SPEC.md`](../SPEC.md); this file says **why**, and what else was considered. Newest additions go at the end of their section. The questions still open are at the bottom.

---

## The app as a whole

### Reskon web appearance (2026-11-15)
The owner chose the mockup combining a crisp dark workspace with warmer colours. The default web theme uses charcoal, ivory and periwinkle; the other built-in and uploaded themes stay available. The board keeps its compact title and existing controls. The second pass carries over the mockup's roomier controls, rectangular labels, card spacing and separated progress area. Status colours remain in the header dots, while column outlines stay quiet. Existing card visibility and density settings still apply. The finishing pass bundles DM Sans under its open font licence rather than asking an outside font service on every visit. Related controls stay visible in framed groups; widget failures offer a retry, and form sections and keyboard focus use consistent styling.

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

### Create new task from the session form's task picker (owner, 2026-11-13)
The owner asked for a "Create new task" button in the task picker of the session form, so a session can be logged against a task that does not exist yet without leaving the form. The button is at the bottom of the picker's list. It opens a small box with only a title (what was typed in the picker's search is the starting title) and an area, so it is quick; everything else is filled in later on the task. The task is made in the first to-do status, as any new task is, and is picked for the session at once. The box is not part of the session form, so pressing Enter in it makes the task and does not also save the session. Quick capture shows the same picker per entry, so it has the button too; quick capture already makes tasks from "future or imperative" lines, so the button is only for when the model guessed the wrong task. The task is made the moment it is created, as everywhere else: if the session is then not saved (or capture is cancelled) the new task stays, and can be deleted like any other. "Create new task" is a real option at the end of the picker's list (so the keyboard and screen readers reach it), and typing narrows the tasks but never hides it. A tag the session has by hand that its chosen task also has is dropped from the session's own tags, so a change to the task's tags is not outlived by a copy.

### The version is shown with its update day (owner, 2026-11-13)
The owner asked to see which version a server is on, and when it was updated, in plain words rather than a commit date. `Updated` is a day written in `internal/version/version.go` and set by hand when a build goes out (a test checks it is a real day, not in the future). It is not read from git or the build clock on purpose: the container build has no git history, and a build clock would change on every rebuild of the same code. The cost is that someone can forget to set it.

### The phone has only the list layout (owner, 2026-11-13)
Columns side by side need a lot of sideways scrolling on a phone, so the owner wants the phone to show a list, Todoist style, and never the columns ("canvas") layout. My first attempt added a phone-only switch that drew the Board as a list, then removed it when the owner said the Board and List layouts looked the same: I removed the wrong one. The rule now: the phone has **no** columns layout. Every view that is not a Timeline opens as the List (the old List layout, with its group-by choice and the Backlog/Cancelled buttons), and the layout button offers only List and Timeline. Choosing List does not change the view's layout for the web app, because the view is synced and a phone should not rearrange the desktop. What is lost on the phone: the column limits (work-in-progress limits) are not drawn. The tags that were drawn on cards now show at the end of a row's grey line. Settings › Statuses on the phone keeps the *Show on the board* switch. The first version of the list had two grey chips that did nothing ("Time in status" and "Group: status"); they are gone. In their place is one row of rectangular buttons, one per group (so one per status when grouped by status), that jump to the section; the Snoozed / Blocked / Incomplete buttons moved up beside the view's name. Buttons on the phone's Board screen are rectangles with small corners to match the cards and fields, not capsules.

### Tags (owner, 2026-11-13)

The owner asked for tags like Jira's labels: several per task, beside areas and epics, also on sessions, picked by the capture model from the tags that exist, and shown in filters, cards, capture and on the phone. Migration 018 adds `tag`, `task_tag` and `session_tag` and nothing else.

**A session's tags are worked out, not copied.** The owner's rule was that a task's tag change reaches its sessions unless the session's tag was put on by hand. That is the same as "a session shows its task's tags as they are now, plus its own", so only the hand-made ones are stored (`session_tag`) and the rest is worked out when the session is read (as AGENTS.md asks of derived values). This also means nothing has to be rewritten, locally or through sync, when a task's tags change. A tag the session has by hand *and* its task also has shows as the task's; if the task loses it, the session keeps it. Detaching a session from its task drops the inherited tags (the owner did not say; this is the least surprising).

**Tags are only a name.** No colour for now (the owner did not ask). Names are case-insensitive and unique, so "Backend" and "backend" cannot both exist.

**Sync.** A tag's record id is made from its lower-case name, and a task's tag from the task's and the tag's ids, so the same tag or link made on two devices merges instead of failing on the unique index (the way custom fields already do). A session's own tags travel as one value of the session, like its subtypes. Deleting a tag removes its links. The tag and link tables use AUTOINCREMENT, because these rows are really deleted: without it SQLite hands the highest id out again, and the new row would inherit the dead row's sync record and reach other devices as a deletion. A session naming a tag the receiving device already deleted is skipped, not an error, so it cannot block a device's sync. A view's tag filter holds tag ids, which are swapped for uids between devices like its areas and epics. The tests cover two devices doing each of these (and fail without each fix).

**Known limits.** Tag names ignore case for a to z only (SQLite's case folding), so "Éa" and "éa" are two tags; capture matches with full Unicode folding and takes whichever comes first. Deleting a tag takes it off tasks and sessions but not out of a saved view's or widget's filter (the filter then matches nothing until it is edited). Two devices that, while apart, rename a tag to a name and create a different tag with that name end up with two tag records that want the same name; the second cannot be added (names are unique), so its links are dropped on the other device and its rename keeps being refused. Rare (it needs a rename and a new tag with the new name before either syncs), and nothing is corrupted; a person can rename one of them. An older server or phone that does not know tags refuses to open a view whose filter has a tag (it rejects the unknown filter key); the other views are fine.

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

## Plugins (connected apps) and live updates (owner, 2026-11-15)

The owner wants Reskon to be a personal management system: the dashboard shows what you are doing and what you should be doing, and things outside task management (a habit tracker now, a food and macros log later) come from **plugins**, separate apps that Reskon connects to. Task management itself stays in Reskon. The to-do list is in [`next-phase.md`](next-phase.md) section 0; how to write a plugin is in [`plugins.md`](plugins.md).

### The architecture check: add parts, don't rebuild
Before building, the code was checked against this plan. The base holds up, so nothing is rebuilt:
- **The API → database split stays.** Each person's own database file stays.
- **The metric list stays.** A new measure is still one entry in it.
- **Go stays (not Kotlin or Compose Multiplatform).** The plugin work is all server and web page, so another language would not make it easier. Compose Multiplatform would mean rewriting every web screen in a younger toolkit, and the phone already shares Reskon's Go code, which keeps its calculations identical to the server's.

What is added, each one as its own part, so later features plug in without touching the rest:
1. **A live-update part** (`internal/live`). It tells each open tab when that person's data changed.
2. **A connected-apps part** (`internal/apps`). It holds app settings, sign-in, fetching and the cache. It sits beside the database part, never inside it, because the phone runs the database part and must never make network calls of its own (see "The phone's networking is in Kotlin").
3. **Widgets get a "source".** Today a widget is always a metric drawn by a chart. A widget's source can now also be a view (for the board widget), an app's data feed, or an app's web page. This is an additive migration, and old widgets keep working unchanged. SPEC 10.1 ("no widget has its own special code") changes with it, in the same commit.
4. **Chart drawing becomes a lookup table.** Today the dashboard picks a chart with a long chain of "if this, else that". It becomes one list of chart types, so a new chart (board, checklist, journal) is one entry.

### Live updates use WebSocket
The owner asked for WebSocket. It is also the better fit here. Without HTTPS, a browser opens at most 6 normal connections to one server. The other kind of live connection ("server-sent events") uses one of those 6 for every open tab, so a few open tabs could hold up ordinary loading. WebSocket connections are not counted against that limit.

How it works:
- The server sends only a short "this kind of thing changed" message, for example "tasks" or "sessions". The tab then reloads what it shows, the same way it already reloads after reconnecting.
- Messages are sent in one place: after any successful change made by that person. This covers changes made in the web app, on the phone (its sync is a change) and by a plugin.
- No data travels over the live connection.

Go's standard library has no WebSocket, so one small pure-Go library is added (`github.com/coder/websocket`, no C compiler needed). The compression wrapper is skipped for the live connection.

### App settings and the cache live in a separate file per person
Each person gets a second file next to their database, `users/<name>-<id>.apps.db`. It holds:
- the connected apps;
- their sign-in tokens;
- the cache.

Why a separate file:
- The phone sync copies the main database, so tokens there would reach the phone.
- The generic settings are sent to the browser at start, so tokens there would reach the browser.
- The cache can be thrown away without touching real data.

A backup copies the app settings too, but not the cache, because the cache is rebuilt by fetching again.

### The cache: SQLite in a file, 10 MB per app, oldest out first
The cache is a SQLite file on disk, not a separate cache program like Redis. That is the normal choice for a single-server app: nothing extra to install or keep running, it survives restarts, and it uses disk rather than memory. Only the answer being sent is held in memory.

The rules:
- Each answer an app gives is saved with its size and the time it was last read.
- When one app's answers for one person pass **10 MB**, the least recently read are deleted until it fits. Nothing expires by age (owner).
- The file is set to give freed space back as it goes, so its size on disk tracks the limit.
- When the app can't be reached, the widget shows the saved answer and when it was fetched.

### A plugin's web page is signed in without its own login screen
The web page widget shows the plugin's own page inside a walled-off frame. The browser loads that page straight from the plugin, so Reskon has to hand it a sign-in.

How it works:
1. You sign in to the app once, in **Settings → Apps**.
2. Reskon keeps the token on the server. It never goes to the browser.
3. To show the widget, Reskon's server asks the app for a **ticket** that lasts one minute.
4. Reskon opens the page with that ticket, and the page swaps it for its own sign-in.
5. Reskon also tells the page its theme colours, so the page can match Reskon's look if it chooses to.

Why not run the plugin's page through Reskon's own address? Then the page could use your Reskon sign-in to read and change all your Reskon data. Keeping it in a separate, walled-off frame is the safe way, and it is how other apps embed third-party widgets.

### Plugins only send data to Reskon in this phase (owner)
Data widgets are read-only. Reskon only asks an app for data, and asks again when you change the date range. It never sends ticks, edits or events to the app. Anything you click, such as ticking a habit, happens inside the plugin's own web page, and the plugin deals with it.

A plugin tells Reskon "my data changed" in one of two ways:
- **From its web page inside Reskon:** a message to the Reskon page around it. This is used for ticks made in the widget and needs no key.
- **From its own server:** a call with a key Reskon gave it when you connected the app. This is used for changes made elsewhere, such as on the plugin's own site.

Reskon then fetches fresh data and updates the widgets live.

Later phase:
- plugin data counting in Reskon's totals;
- Reskon telling the plugin what happened;
- tasks pointing at items in an app.

### Fetching from an address the person typed
An app's address can be anywhere on the home network, just like the capture model's. Fetching uses the same protections as capture:
- no following of redirects;
- a size limit;
- a time limit;
- the app's error text is never shown back to the browser.

Anyone signed in can connect an app; it is not limited to admins (owner, 2026-11-15). Reskon is a private, self-hosted system, and whoever hosts their own copy controls who has an account.

### App sign-ins are kept as plain text in the apps file (2026-11-15)
An app's token is stored as it is in the person's apps file, the same way the capture model's key is stored in their settings. Encrypting it would need a key the server can read without a person present (to fetch widgets), so it would sit on the same disk and add little. What protects it:
- the file sits in the data folder that only the server can read;
- the token never goes to the browser or the phone;
- a password is never stored at all, only the token the app gives in exchange.

The backup copies the apps file (as `apps/<name>.db` in the backup folder), so a backup holds the tokens too: keep backups as private as the data folder.

Left as they are, after the security review (2026-11-15): a password typed for an app on an `http://` address crosses the home network unencrypted (as everything does until HTTPS, next-phase 2.1); there is no limit on how often someone looks apps up; backup folders use the default file permissions, as before; and for the very first account, made from a pre-accounts database outside the data folder, the apps file sits beside that database.

### A pretend plugin for testing (2026-11-15)
`cmd/example-plugin` runs a pretend habit tracker (the same one the Go tests use, `internal/apps/appstest`) so a test server can connect a real app before the owner's own tracker supports the contract. Its username and password are fixed and only for testing. It grows with each step (widgets, data, the "changed" message).

---

### Apps in the sidebar (2026-11-15)
An unreachable app stays clickable in the sidebar, because its page may still load even when Reskon could not read its description. It is shown with a warning icon and quieter text, and its reason is in the tooltip. The browser never works out an app's page address itself; the server sends it ready (`home_link`). Settings > Apps tells the sidebar in the same tab by reloading the app's start-up data; other tabs hear about it through live updates.

### An app's page on a dashboard (2026-11-15)
How the web page widget (next-phase step 5) works, and why:
- **The widget saves names, not addresses.** Its query is the app's id and the page's id, for example `{"app": "habits", "widget": "today"}`. These ids never change, so the widget survives the app being removed and connected again (even at a new address). The database only checks the shape; whether the app is connected and offers that page is checked by the server's API when you save, because the phone runs the database code and has no apps.
- **A widget keeps its source.** A metric widget cannot be turned into an app page or back: the query means something different for each. Make a new widget instead. An app page's chart type is always `page`, which no metric may use.
- **A fresh ticket every time.** Reskon's server asks the app for a ticket each time the widget is shown and on Refresh (a ticket works once, for a minute). The request is `POST /api/apps/launch` with the widget's id, so the browser never names an address or sees the token. It changes none of your data, so it sends no live note: otherwise each launch would make every other open tab reload, which would launch again, forever.
- **Refresh loads the page again**, with a new frame and a new ticket, rather than sending the page a "refresh" message. This works for every app, including one that ignores messages. The page is not reloaded when Reskon's own data changes: that means nothing to it, and each load spends a ticket.
- **The browser adds the theme to the address** (`&theme=…` after the ticket). The colours are the person's own theme, not a secret, so there is no reason to send them to the server and back. `bg` is the widget's own background, so a page that uses it blends in; the font is a plain system font, since the page cannot load Reskon's font file.
- **The frame's walls.** It may run scripts, send forms, call its own server and open links in new tabs; it may never move the Reskon tab. Messages to it go to the page's exact origin, never "anyone". Reskon refuses to show a page on its own address, because there the walls would not hold. Reskon's own pages still refuse to be framed anywhere; nothing limits which other sites Reskon's pages may frame, which is what this needs.
- **When the app says no.** An app that refuses Reskon's sign-in gets "sign in to <app> again in Settings › Apps", sent as an ordinary error (400), never a 401, because the web app reads a 401 as "Reskon signed you out". A removed app or page is a 404 with the reason; an app that cannot be reached is a 502.
- **The phone** shows such a widget as "Shown in the web app" and does not ask the metrics API for it (plugin widgets on the phone are a later phase).
- **An app on the same machine name as Reskon sees Reskon's sign-in (owner, 2026-11-15: fix it with a separate name).** Browsers send a site's cookies to every port on the same machine name. So with Reskon at `192.168.0.8:8097` and an app at `192.168.0.8:8098`, every request the browser makes to the app (the widget's page, the sidebar link) carries Reskon's sign-in cookie. The cookie is HttpOnly, so the app's scripts cannot read it, but the app's server receives it and could use it to act as you in Reskon. No frame setting can stop this. Reskon does not refuse such apps, because on a home network everything often runs on one machine; instead Settings › Apps warns, on the look-up and on the app's row, that the app can see your Reskon sign-in and should be one you trust. A different machine name for the app (or HTTPS with its own name, next-phase 2.1) avoids it. The owner chose to fix it before using plugins: give Reskon (or the app) its own name, for example through the router's DNS or a hosts entry, so the two never share a machine name. The warning stays as a guard; same-machine apps are not blocked.
- **A tab opened from an app's page cannot touch Reskon's tab.** The frame may open links in new tabs (so the plugin's `target="_blank"` links work), and such a tab is not walled off. Reskon sends `Cross-Origin-Opener-Policy: same-origin`, so that tab gets no handle on Reskon's tab and cannot send it to another address.
- **The token goes to the launch address saved at the last check (accepted).** Reskon sends the app's token to the `launch_url` it read when the app was connected or last checked. If someone took over that address between checks, they would receive the token. This is part of trusting the app's address in the first place; **Check again** reads the description afresh, and an app whose id changed is not sent the token at all.
- **Refused, and why.** A page on Reskon's own address is refused twice: by the server (against the address the request came to) and by the browser (against the address it is on), because the walls do not hold there. A 403 from the app's launch address means the same as a 401: sign in again. An app page widget cannot be saved for an app that has a problem (another app answering at its address), and a widget on a deleted dashboard is not shown.
- **The pretend plugin** (`cmd/example-plugin`) now has the "Today's habits" page: it swaps the ticket for a session kept in memory, lists three habits as checkboxes, keeps ticks in memory per day, and may be framed only by the Reskon address given with `-reskon`.

### An app's data on a dashboard, and the cache (2026-11-15)
How the data widget (next-phase step 6) works, and why:
- **Drawn by Reskon's own charts.** The server turns each answer into the same shape the metrics API answers with (points, series, a total), so bars, lines, numbers and lists draw it with no new code. A table keeps the app's own columns; a checklist is one new chart type, read-only. Which chart types suit which shape is one list on the server (`AppDataVizzes`), checked when the widget is saved; the editor offers only those. Stacked bars are offered once the preview shows the series has parts.
- **Running totals come from the server**, as for metrics: a cumulative chart of an app's series is summed by Reskon's server, never in the browser.
- **Saved by name, checked like an app page.** The query is `{"app", "widget", "range", "group"}`. The database checks only its shape (the phone runs it and has no apps); the API checks the app is connected, offers that data, the chart type suits its shape, the range is only on data that takes one and the group is one it lists. A change of the chart type alone is checked against the saved query too.
- **"All" is not a range for an app.** It means "since your first Reskon record", which says nothing about an app's data. The other ranges (today, 7, 30, 90 days, a year, this month) are counted back from the person's today in their time zone.
- **Asked every time it is drawn**, fresh: when shown, on Refresh, on live updates and on new dashboard dates. The cache is only for when the app cannot answer usefully. These requests are GET and change none of the person's data, so they send no live note (one would make every tab fetch again, forever).
- **The cache is keyed by the range as chosen, not its dates.** "The last 7 days" asked today and tomorrow is one entry, so the morning after, with the app down, the widget still shows yesterday's copy with its time, rather than nothing. The dashboard's own dates are kept as dates. The time zone and the group are part of the key.
- **The editor's preview uses the same cache.** A preview asks the app with the same parameters a saved widget would, so its answer is kept too, and the new widget shows something at once even if the app goes down right after saving.
- **What is kept is Reskon's checked version of the answer**, never the app's raw reply, so nothing unchecked is ever stored. An answer that breaks the contract is not stored: the previous copy stays and is shown, with "sent data Reskon cannot use".
- **The stale note is short and in Reskon's words**: "Showing the copy from 14:05: Habits answered HTTP 503". The app's own reply text is never shown, and the address with its parameters is replaced by the app's name.
- **An app that changed at its address** (another app answers there) is not asked at all, so it never receives the token; the copy is shown with "check Habits again".
- **The 10 MB limit and the file's size.** After each answer is stored, that app's least recently read answers are dropped until it is back under 10 MB; the one just stored is never dropped. Reading a copy marks it read. The apps file is switched to give freed space back (SQLite's incremental auto-vacuum) once, when it is opened: SQLite only switches an existing file with a full VACUUM, which cannot run in a migration's transaction. Space is given back after each drop and when an app is removed.
- **Removing an app removes its copies** (a foreign key with cascade).
- **50 MB per person over all apps (review, 2026-11-15).** Besides 10 MB per app, all of one person's apps together keep at most 50 MB, the least recently read across apps going first, so connecting many apps cannot fill the disk. Chosen over a limit on how many apps a person may connect, which would be a rule people notice.
- **A copy in an old shape is never drawn.** If the app now says the widget's data has another shape, a kept copy in the old shape is dropped. If the widget's saved chart type no longer suits the new shape, the widget says "edit this widget and choose another chart type" (a 400).
- **Stacked bars of a series without parts are accepted** and drawn as plain bars: the app may send parts one day and not the next, and plain bars are still right.
- **Only Reskon's own pages may ask for an app's data.** The two data requests are GETs that call the app and fill the cache, so a request another site's page made (a link or an image pointing at Reskon) is refused, by the browser's `Sec-Fetch-Site` header. Dates are capped at 400 days at a time.
- **An app's units are shown as the app wrote them** ("50 hours", "3 glasses"): Reskon's own ways of showing hours (days past 48 hours) or ratios (percent) are for its own metrics only. A table shows the unit in its column header.
- **App text may not hold invisible format characters** (zero-width spaces, byte-order marks, soft hyphens, tag characters), as well as control and direction-changing ones: they could make text look like something it is not.
- **A slow upgrade of one person's apps file holds up only that person**: it is opened under a lock of its own, not the server-wide one.
- **The backup leaves the cache out.** The copy of the apps file is emptied of cached answers and compacted, so not even their bytes remain; the app settings and sign-ins stay. A file from before the cache existed is copied as it is, and a backup never upgrades a file.
- **No time zone yet means UTC** for the app (`tz=UTC`), and "today" is then UTC's today too, so the dates and the zone sent agree: the server's own zone has no name an app could read.
- **The pretend plugin** now offers four data widgets (Today checklist, Done per day series by day or week, Streaks table, Longest streak number), with made-up ticks for the 20 days before today, and two test-only calls with its token: one switches every feed off (they answer 503) and on, one ticks a habit, so browser journeys can show the kept copy.

### An app says "my data changed" (2026-11-15)
How next-phase step 7 works, and why:
- **Only a signal comes in.** The app says "changed" and nothing else; Reskon asks the app's feeds again through the normal data route. Reskon still sends the app nothing but the key at connect time (the owner's rule above).
- **Its own live topic, `app_data`, naming the app.** The general `apps` note (sent when an app is connected or removed) reloads everything in a tab. A "changed" note instead makes only that app's data widgets fetch again, so a tick does not reload the board, the sidebar or the other widgets. The note carries the app's id ("habits"), a name rather than data.
- **App page widgets are never reloaded by it.** A reload would wipe what the person is doing in the page, spend a ticket, and the page already shows its own change.
- **From the page: exact checks, nothing read.** Reskon's page acts on a message only when it comes from the very frame it opened for that widget and from the app's own origin (from the launch answer), and reads only `type`. The plugin may post to `"*"` because the message holds no secret. The tab tells the other tabs through `POST /api/apps/:app/changed` (a normal signed-in call, so its own tab is left out as usual), rather than the other tabs trusting each other.
- **Fetched after the last of a burst, never the first.** In the browser a "changed" waits 300 ms for more, then the widgets fetch once; under a steady stream they still fetch at least every 1.5 seconds. If a fetch is already running, its answer (asked before the change) is not shown, and exactly one more fetch follows it, so a stream of changes never cancels fetches forever. The chart stays on screen meanwhile. Signing out drops anything still waiting.
- **One limit per person per app, both ways in.** Whether "changed" comes from the page (through `POST /api/apps/:app/changed`) or from the app's server, each person's app sends at most one note every 2 seconds; calls in between become one note at the end of the wait, which goes to every tab (the tab that sent it fetches once more, harmlessly).
- **From the app's server: a key, kept as a hash in auth.db.** The call carries no cookie, so the key alone must say whose app it is, before any person's file is opened; so the list is in `auth.db` (table `app_hook`), the one file shared by everyone, like sign-in sessions. Only the SHA-256 of the key is kept, and a key is found by its hash (one indexed look-up), so there is no comparison whose time could leak how close a guess was. A key is 32 random bytes. The key list and each person's apps are separate files, so every call also checks the app is still connected and the account not disabled.
- **The address handed to the app is the one the browser used** (`changed_url` = scheme and `Host` of the connect request + `/api/apps/changed`; behind a declared proxy, `X-Forwarded-Proto` decides http or https). That is the address most likely to reach Reskon from the app's server too. A setting for a fixed public address could be added if a proxy setup ever needs it.
- **When it is handed over (owner, 2026-11-15: every check).** On connect, and every time the person presses **Check again** or **Sign in again**, so either button cures an app that lost its key (a plugin restarted without saving it, for example). Dropped when the description no longer has `connect_url` (every time, whether or not a key is on record, so an old key can never come back), at the start of a connect, and when the app is removed.
- **Handed first, stored after.** A new key is sent to the app first, and replaces the stored one (in one transaction) only once the app has answered 200 or 204. A failed hand-over keeps the old key working, so a plugin that kept it is not cut off. One person's hand-overs for one app (and its removal) take turns, so two checks at once can never leave Reskon keeping a different key from the one the app kept. A call the app makes in the moment between taking the key and Reskon storing it is lost; widgets still refresh when opened. The saving and clean-up finish even if the browser tab is closed midway. A failure leaves the app connected, with the reason shown in Settings › Apps in Reskon's words (the app's own reply text is never shown). The key is never logged or sent back to the browser.
- **The address may be wrong behind a proxy.** Only with `JITTERBUG_BEHIND_PROXY=1` are `X-Forwarded-Proto` and `X-Forwarded-Host` believed for the address handed to the app. If the request looks proxied without that setting, or the browser was on HTTPS but the address is plain HTTP, the key is still handed over and Settings › Apps shows a warning saying the app may not reach that address.
- **The public hook says nothing.** It is public for POST only (any other method at that address is an ordinary signed-in call). Every call with a key answers 204, known key or not, malformed or not, rate-limited or not; only a call without a `Bearer` key (any capitals) gets 401. The body is ignored (at most 1 KB is read). A key not exactly 43 letters, digits, `-` or `_` is never looked up. A call while a note for that key is already waiting does no work at all. Each address may miss (a well-formed key that is no one's) 30 times a minute; after that its calls are not looked up until the minute is over, so junk keys cannot keep `auth.db`'s one connection busy. Keys are only remembered by the limiter after they were found, so random keys cannot fill memory.
- **Not usable from another site's page.** A browser cannot add the `Authorization` header to a cross-site request without Reskon's permission (which is never given), and a cross-site POST carries an `Origin` header that Reskon refuses (as for every other write). The plugin calls it from its own server, where neither applies.
- **The pretend plugin** has `connect_url` (`/api/reskon/connect`): it keeps the address and key in memory (a restart forgets them; **Check again** hands a new one), and a successful tick through its test tick call then calls the hook. Its page already posted `changed` after a tick.

### A board of open tasks on the dashboard (2026-11-16)
How next-phase step 8 works, and why:
- **A widget names a view, nothing more.** Its question is `{"view_id": 3}` and nothing else is allowed in it. The tab reads the tasks with the call the board already uses (`GET /api/tasks?view=:id`), so the view's filter is still worked out on the server and a change to the view changes the widget. No new endpoint.
- **Columns mirror the view's own board, minus the finished ones.** The same on-board statuses, narrowed the same way by the view, in the same order, kept only when their category's behaviour is to do or in progress (never by a status's name). So a column the board keeps off (Backlog) is not on the widget either: "what I need to do now" is what is on the board, and Backlog is the parking place. If the owner wants Backlog shown, it is a one-line change.
- **The same tasks as the board.** Snoozed tasks are left out, and blocked ones unless the view shows them, so a count on the widget matches the same column on the view's board. Cards come in the view's own card order.
- **Cards show the title, priority, level and due date**, from one fixed small setting, not the view's own card settings (those would make cards too tall for a widget). Overdue, stalled, blocked and subtask counts still show because the card shows them regardless. Never the task key.
- **20 cards a column, then "+N more".** The widget draws a page, not a whole backlog; **+N more** and an **Open view** button open the full view. The count in each column's header is always the true number.
- **It ignores the dashboard's dates.** A board shows what is open now; picking a Day or Dates on the dashboard changes the charts but not the board.
- **Read-only.** No dragging, so nothing on the dashboard can change a status by accident; moving stays on the board. Clicking a card opens the task panel, as on the board; edits made there show in the widget when the panel closes. While the dashboard is in edit mode a click does nothing, so it cannot fight the dragging of the widget itself.
- **A view that is deleted later leaves the widget in place**, saying so and offering Edit to pick another; it is not removed behind the person's back. Saving a widget for a view that does not exist (or was deleted) is refused.
- **Between devices the view id is translated**, like the ids inside a view's own filter. If this device has no view for the id it is kept as it came (not dropped): no view here has it, so the widget says its view is gone and never draws some other view, and the query stays whole, so an emptied query can never win a tie on a later sync and erase the other device's widget. Because the phone's own Go core does this translation, it is a phone change and the phone needed a new signed release.
- **The chart type is always "board" and belongs to this source only**: no metric or app data can be drawn as one, and a board widget cannot take another.
- **A source this version does not know** (from a newer Reskon) can still be moved, renamed and removed. Before, that worked because "view" was not built yet; now every planned source is built, so repeating a widget's own source is allowed before the list of known sources is checked.

### "Yesterday" and the Home dashboard (2026-11-16)
How next-phase step 9 works, and why:
- **Yesterday is one more range, worked out like Today.** It is the day before the person's own today (in their time zone, not UTC's), so at 00:30 on the 16th in India it is the 15th. It is in the metrics list of ranges and in the apps list (an app is asked for that one day, `from` and `to` the same). Both lists share one date calculation, so they cannot disagree. A kept copy of an app's answer is stored under "range=yesterday", like the other ranges.
- **Home is added by a migration (020), for everyone.** It is shown first by giving it a position of -1, so no other dashboard is moved (moving them would also have made every device think they changed and sync that). Dashboards are ordered by position then id, and the dashboards people make start at 0 and up.
- **The board is picked in the migration, in SQL, by layout and position, never by name.** The first view with a board layout, in the order of the sidebar; if there is none, the first view of any layout. The fallback is on purpose: a new account has only the table view "Everything" until its first area makes a board view, and a Home with no board would miss the main point. The board widget draws the same open columns whatever the view's layout, so a table view works. With no views at all the board is left out and the rest of Home still works. The widget is called "Open tasks" (not the view's name) so Home reads the same for everyone. The person can edit the widget to show another view.
- **Why not pick the view when Home is opened.** The migration is enough, it keeps the choice in one place and the phone (which runs the same migration on its own data) gets the same result. The cost: if a person later adds a better board view, Home keeps the one it chose until they edit the widget.
- **Layout (12 columns, rows are 40 px).** Board 8 wide and 8 high at the top left; the two yesterday numbers, 4 by 4 each, stacked on its right; the two 7-day bar charts 6 wide each along the bottom. The numbers use "group by day" so each shows one total, not one figure per type. Points and hours are both there: points is what the owner asked for, hours is the optional extra, and both are one line of the migration to remove.
- **Widgets say which dates they show while the dashboard's day is on.** Home's fixed titles ("Hours yesterday") would mislead when a person picks another day on the dashboard, so every widget the choice changes shows a small "showing 14 Nov" note. To know which ones it changes, a metric's answer now says whether its range counted (`ranged`); a measure that is a current state ignores the range and shows no note. A **Yesterday** button sits beside **Today** in the Day choice.
- **An existing "Home" is left alone.** Names need not be unique, so a person who already made a dashboard called Home gets a second one. Adding it anyway is the reversible choice; renaming or deleting someone's dashboard is not.
- **Every device makes the same Home, with fixed ids, and Home syncs like any dashboard.** A dashboard's and widget's id differs between databases, so Home has fixed sync ids (`b-dashboard-home`, `b-widget-home-board`, ...) as the built-in dashboards do, and the migration skips anything that already exists under that id. Without this, the server and the phone would each push their own Home and a person would see two. The migration does not touch sync marks: on a database that has been opened before, the marks for the new rows are kept, so Home and its widgets are pushed once like any new rows (another device's Home then updates the same rows instead of adding a second), and a mark that was there already, such as an edit to Home made on a phone that had been sent it and not yet pushed, is never lost. A first version of this step removed those marks; that could lose such an edit, so it was dropped.
- **Where two devices chose differently, the last writer wins.** The one thing two devices can disagree on is the board's view (the first board view by position; two views can tie on position, and the tie is broken by each database's own ids, which differ). With the marks kept, whichever device syncs last settles it, and from then on both show the same view. The person can edit the widget to show another view at any time. This is accepted: it is a starting choice, not data.
- **The phone needs a new release to get it.** The phone runs the same migration on its own data and shows Home as a dashboard (the board shows there as "Shown in the web app", like any non-metric widget), and the Yesterday range goes through the same metrics code in its own core. A phone is sent Home by the server on its first sync (which sends everything), and after that whenever the server has Home or its widgets marked as changed: an upgraded server that already held data marks it when it upgrades, and any later edit marks it; a brand-new server does not, since both sides make the same Home themselves. An older phone that is sent Home cannot work out "yesterday" and shows an error in those two number widgets until it is updated. So the signed release was rebuilt with this step.
## The journal (next-phase step 10)

- **The Markdown is built on the server, not in the browser.** One function (`Journal`, in `internal/db/journal.go`) answers both the Sessions screen's Copy as Markdown and the journal widget, so the text and the day's totals are worked out once (AGENTS.md: totals come from the server), are easy to test with exact expected text, and the phone can reuse them later (its core is the same code). The cost is one small extra request when the Sessions screen loads; it is made then, not on click, because browsers only allow a copy straight after a click.
- **Times are the start time to start plus hours, in the person's time zone** (the `time_zone` setting, as for "today"), written HH:MM. A session without a start time shows none. If it ends after midnight the end is just the later clock time.
- **A session's name is the task's title, else its own description, else "Session" or "Event".** The task's title is read even from a task that was deleted, so old sessions keep their name. The task key is never used.
- **Order inside a day:** sessions with a start time first, in time order, then the rest in the order they were logged. This differs from the Sessions table (newest logged first) on purpose: a journal reads from morning to night.
- **Text typed by the person is escaped, not trusted.** A session name that starts like Markdown gets a backslash (`\# not a heading`); a note line made only of `-` or `=` gets one too (it would turn the line above into a heading); lines that another follows end with two spaces, so renderers that ignore single breaks keep the lines apart. The two trailing spaces are invisible, which is the price; a backslash at the end would show in plain text.
- **Times are shown only when the start belongs to the day:** its local date is the day it is logged for, or the day before. A start time left over from some other date (an import, an edited date) would only mislead, so the line shows no times. Such a session is listed with the untimed ones.
- **Every answer is capped:** the widget at the newest 62 days, any answer at 366 (`more` says so). The Sessions screen asks for the dates shown; a day beyond the cap is fetched alone when its button is clicked.
- **Copy as Markdown always copies the whole day,** even when the Sessions filters hide some sessions, the same as the day totals beside it (which already say they include all sessions).
- **Clipboard fallbacks.** Browsers hide the clipboard on plain http, which is how the home server is reached. So: the clipboard, then the older copy command (which works there), then a box with the text selected. "Copied" is only said when a copy really happened.
- **The journal widget saves only a range** (Today, Yesterday, 7 days, 30 days, This month; no 90 days or year, since every session is listed), and its chart type is always `journal`. Like the board it takes no filter. At most the newest 62 days with sessions are listed, and it says so when older ones were cut off. The Sessions screen's copy is limited only by the 366-day cap, and a day beyond it is fetched alone when clicked. No migration: the source column already exists (019), and the phone's core accepts the new source; the phone shows it as "Shown in the web app".
- **Seeded dashboards are not changed.** Home has no journal; the owner adds one if wanted.

### Widgets that reach a server before it is upgraded (2026-11-16)
On the live server, Home arrived from a phone (already on the newer core) while the server was still on 0.3.0. That server had no `source` column, so it kept the Board without its kind and with the phone's sync id for its view; after the upgrade the Board would have been a broken "metric" widget. Migration 021 repairs this kind of row on every device: the kind is read back from what only that kind has (viz `board`, `page` or `journal`, or a query naming an `app` and `widget`), and a Board's view sync id becomes this device's view id when it is known. Lesson for later: upgrade the server before the phones when a release adds widget kinds.

---

### A tab left open stays connected (2026-11-17)

The owner wants a tab to stay up to date however long it is left open. Reconnecting after a drop and reloading afterwards already existed. What broke was a connection that dies without telling the browser: after a laptop sleeps or wifi changes, the socket still looks open, never reports a close, and the old code only retried when it knew the socket was gone. The tab then showed stale data until a manual refresh. Fix: the connection is replaced on purpose when the network comes back, when the tab becomes visible after more than 30 s away, and when the tab's timers show it was frozen. The replacement reports a reconnect, so what is on screen reloads once. No server change was needed (a server heartbeat message would have made old open tabs reload every 30 s).

An open tab still does **not** keep the sign-in alive: the sign-in is renewed only by using the app (a security choice of the owner, unchanged). If the sign-in has ended, the reconnect is refused, one signed-in call gets a 401, and the sign-in page shows.

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
- **A fixed "Reskon's address for apps" setting.** The address handed to an app for "my data changed" is the one the browser used. If that only works from the person's computer (a name only that computer knows, such as a hosts entry for the separate machine name planned for Reskon, or a proxy that was not declared), the app's server cannot call back, and Settings shows "ok" because the app did take the key. An optional setting for the address apps should use would fix this. Not built; until then, connect apps from an address the app's server can also reach.
- **The Jira import** maps worklogs to each area's default energy type (Main job and Freelance → Engineering, Personal → Admin). Check before importing.
