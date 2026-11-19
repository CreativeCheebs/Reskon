# Next phase: what is still open

Everything here is something the review and fix round (branch `phase-2`) did **not** finish. Each item says what it is, why it matters, and how you will know it is done. Items the owner has already decided are marked **Decided**; the rest still need a decision or a first look.

Where a choice is recorded, it is in [`decisions.md`](decisions.md) (the "Open questions" part). This file is the to-do list; that file is the reasoning.

## 0. Plugins and the personal dashboard — **Decided (owner, 2026-11-15), build in this order**

**The goal, in the owner's words, shortened:** open the dashboard and see what I'm doing and what I need to do:
- my open tasks as a small board (to do and in progress);
- how much time and how many points I did yesterday, and a 7-day chart;
- what I did each day (my session notes, like a journal);
- today's habits and the last few days of them (from the habit tracker plugin).

Later, food macros, protein and a healthiness rating for the last 7 days (from a food plugin).

Task management stays in Reskon; other things come from plugins. The reasons are in [`decisions.md`](decisions.md) ("Plugins (connected apps) and live updates"), and the guide for plugin writers is [`plugins.md`](plugins.md).

Each step below is built, tested, reviewed and committed on its own.

1. **Live updates (WebSocket). Done 2026-11-15:** checked with two browser tabs on the test server, and the container starts on empty and existing data. An open tab updates by itself when your data changes anywhere: another tab, the phone, a plugin. Done when: a change made on the phone shows in an open browser tab within a few seconds, with no refresh.
2. **Groundwork (a refactor, its own commit, no visible change). Done 2026-11-15:** every dashboard widget checked on the test server after the database upgrade. Left for the steps that add a new source: the phone app still asks the metrics API for every widget (it must show "needs a newer version" for other sources, as the web does), and the web widget's Refresh and Edit buttons should hide for a source it cannot show. Both done in step 5. The dashboard picks how to draw a widget from one list of chart types instead of a chain of "if this, else that". Widgets get a "source": a metric (all of today's widgets), a view, an app's data, or an app's web page. Done when: every existing dashboard looks and works exactly as before.
3. **Settings → Apps. Done 2026-11-15:** checked on the test server against the pretend plugin (`cmd/example-plugin`). Add an app by its address, sign in to it once, and see whether it is reachable. App settings, tokens and the cache go in each person's separate apps file. Done when: the habit tracker (or the test plugin) connects, and the token never reaches the browser or the phone.
4. **"Apps" in the sidebar. Done 2026-11-15:** checked in a real browser on the test server against the pretend plugin: connecting it in Settings shows the Apps heading and the app in this tab and in a second open tab without a reload, the entry is a link that opens the app's page in a new tab, and removing the app takes the heading away. A new Apps heading, with one entry per connected app below it, opening the app's own page. Not browser-checked: the look of an app that cannot be reached, and the folded (icon-only) sidebar.
5. **Web page widget. Done 2026-11-15:** checked in a real browser on the test server against the pretend plugin: Add widget › App page picks Habits › Today's habits, the page shows inside the widget already signed in (no login screen), a habit ticked inside it is still ticked after Refresh (a new ticket each time), and the widget, its dashboard and the app are removed again. Go tests cover one-time and 60-second tickets, the token never reaching the browser, an app that refuses the sign-in, is removed, or is replaced by another app at its address, and no live note from a launch. The phone shows such a widget as "Shown in the web app" (unit tests and the signed release built; not tried on a phone). Not browser-checked: a theme switch reaching an open page (a component test checks the colours go only to the page's own address), and an app that cannot be reached. Shows an app's small page on the dashboard, already signed in (one-minute ticket), in its own look or in Reskon's colours. Done when: today's habits show and can be ticked inside the widget.
6. **Data widgets and the cache. Done 2026-11-15:** checked in a real browser on the test server against the pretend plugin: Add widget › App data adds Habits › Today as a checklist and Habits › Done per day as bars, Streaks as a table and Longest streak as a number in the app's own units (live preview in the editor), then edits Done per day into a 30-day line, a habit ticked in the app shows after Refresh, and with the plugin's feeds switched off Refresh shows the kept copy with "Showing the copy from <time>: Habits answered HTTP 503"; switched on again, fresh data and the note gone. Also checked on the Linux server: a new, empty data folder starts, draws an app data widget, and its backup keeps the app but no cached answers; the test server's existing apps file was upgraded on start. Go tests cover the answer checks (every shape, limits, no app text in messages), the 10 MB limit dropping the least recently read, space given back to the disk, removing an app removing its copies, an older apps file being upgraded, the backup leaving the cache out (not even its bytes), saving only chart types that suit the shape, no live note from fetching, and another person's widget or app never reachable. Not checked: the container (Docker is not run on the Windows PC), the cache reaching 10 MB with real data, and the look of a stale table or number widget. An app's numbers, lists, tables and checklists are drawn by Reskon in Reskon's style, using Reskon's chart types; a kind Reskon can't draw yet needs a new chart type in Reskon first. Changing the date range asks the app again. The cache keeps up to 10 MB per app per person, dropping the least recently read first. Done when: with the app switched off, the widget still shows the last data and when it was fetched.
7. **Plugins say "my data changed". Done 2026-11-15:** checked in a real browser on the test server against the pretend plugin, with two tabs on one dashboard holding the Habits page widget and the Habits › Today checklist: a habit ticked inside the page updated the checklist beside it and the one in the other tab with no Refresh, and a tick made in the app itself (its test call, which then calls Reskon with its key) updated both tabs too; neither tab asked for a new page ticket or reloaded its other data, and the page kept its own state. Also checked on the Linux server: a new, empty data folder starts and the hook answers; the test server's existing files were upgraded on start. Go tests cover the key handed at connect (the address as the request reached Reskon), only the hash stored, notes only to that person's tabs, a burst folded into one more note, unknown keys answered the same and doing nothing, no key or a cross-site page refused, the page route sending the app's note and not the general one, a fresh key from Check again and from Sign in again (the old one then stops), the old key kept when a hand-over fails, many checks at once ending with the key the app kept, keys dropped on removal or when the app stops offering `connect_url`, a disabled account's key doing nothing, only POST being public at the hook's address (other methods refused signed out), malformed keys and lower-case "bearer", one 2-second limit per app shared by both ways in, the per-address limit on missed keys, and the address handed over behind a proxy (with its warnings). Component tests cover the frame check (only its own frame and origin, only `changed`, nothing from an old frame after Refresh or after the widget is gone), bursts folded with a 1.5-second most, a change during a fetch giving exactly one more fetch and never the older answer, and the Settings › Apps warnings. Not browser-checked: those Settings › Apps warnings, and the container (Docker is not run on the Windows PC). From inside the widget (a message to the page) or from the plugin's server (a key given at connect time). Reskon fetches again and updates the widgets live. Done when: ticking a habit in the web page widget updates the habit data widget beside it.
8. **Board widget. Done 2026-11-16:** checked in a real browser on the test server: Add widget › Board picks a view (the title follows it), the widget shows the view's to-do and in-progress columns with their counts, no done column, no task keys and the newest tasks first; a card opens the task panel; a task moved by another tab shows in the widget within a few seconds with no refresh; Refresh keeps the cards on screen while it reloads; and Open view goes to the view. Go tests cover saving (only the view's id, the view must exist and not be deleted, the one chart type, no metric or app data drawn as a board, a deleted view leaving the widget in place, a widget of a newer source still movable), another person's views never reachable, and the view's id following the view to another device when syncing. Component tests cover the columns following each status's behaviour (a status named "Done" in a to-do category shows, one named "Shipped" in a done category does not), the view's own status narrowing, snoozed and blocked tasks, the 20-card limit with the true count, opening from a click and the keyboard, and nothing opening while editing the layout. The phone shows such a widget as "Shown in the web app" (already so), but its Go core now carries the view's id between devices, so the Android build, its unit tests and the signed release were redone (see below). Not checked: the look on a narrow screen, a widget whose view was deleted (only in tests), starting on a new empty data folder on the Linux server (there is no schema change; the test server's existing data started fine), and the container (Docker is not run on the Windows PC). The live check made the move from a second tab through the move call, not by dragging a card on the board. A small board of open tasks (to do and in progress) on the dashboard, built from a saved view so the filter is still worked out on the server. Done when: the dashboard shows what is open, and a task moved on the board moves in the widget by itself.
9. **"Yesterday" and a Home dashboard. Done 2026-11-16:** a new **Yesterday** range (the day before your own today, in your time zone) for chart widgets and for an app's data, and a new dashboard **Home**, listed first for everyone, with your open tasks as a small board, hours and points for yesterday, and 7-day bar charts of points and hours. Checked on the test server: the test account's existing data was upgraded on start and shows Home first (position before the others, its board on the account's first board view, the other dashboards unchanged); a new, empty data folder started on the Linux server on a spare port, made its first account and listed Home first with all five widgets (its board shows the only view a new account has, the table view Everything), and its yesterday widget answered with the right single day; then that run was stopped and its folder removed. In a real browser on the test server (all journeys pass, one skipped as before): Home is the first dashboard and the one shown, its widgets draw with no error and the two "yesterday" widgets ask for the day before the browser's today, picking Day › Yesterday on the dashboard puts "showing <day>" under each chart it changes and nothing under the board, and a chart widget switched to Yesterday in the editor saves and redraws for that day (and an app's data widget lists Yesterday in its range choice). Go tests cover the date maths around midnight and in other time zones (Kolkata just after midnight while UTC is a day behind, Los Angeles just before midnight while UTC is a day ahead, month, year and leap-day ends, for both chart widgets and app data), the migration on a new database, on an existing one with the sync triggers live (fixed sync ids, its marks kept so Home syncs like any dashboard, marks that were already there never lost, other dashboards and positions unchanged, a dashboard already called Home kept, the board view chosen by layout then position and never by name, no views at all), and Home reaching the other device as one dashboard in every order: an edit made on a not-yet-upgraded phone still reaching the server after the phone upgrades, and an already-paired old phone that is sent changed and added Home widgets ending the same as the server after it upgrades. The phone's own core lists Home first and answers its yesterday widgets (a Go test); no phone screen code changed, and the signed release was rebuilt (Reskon-0.3.3.apk, in /home/aakash/apks/) so a phone using its own data gets Home and the range. Not checked: Home on a phone itself, the look of Home on a narrow screen, the container (Docker is not run on the Windows PC), and an existing account with several board views (only in Go tests). The phone's own date picker still has no Yesterday choice; its widgets use their own dates by default.
10. **Journal. Done 2026-11-16:** checked in a real browser on the test server: a session logged on a task with a two-line note and a start time; **Copy as Markdown** on the Sessions screen puts the server's text on the clipboard (read back by pasting): the heading with the day's hours and points, the line with its times and the task's title and area, the note's two lines indented, and no task key; **Add widget › Journal** on a throwaway dashboard shows that day with its time, title, note lines and no key, its own Copy as Markdown copies the same text, and clicking the task opens its panel. All browser journeys pass (one skipped as before). Go tests cover the exact Markdown (times in another time zone, Windows line endings, a blank line inside a note, no key, an event's label, area, totals), the order, days without sessions and deleted sessions left out, deleted tasks keeping their title, the 62-day limit and its "more" flag, the widget's saving rules (only a range, only the one chart type, no metric, board or app data passing for one), a journal widget syncing unchanged, and nobody reading another person's journal. Component tests cover the widget (totals as the server sent them, notes as plain text, times only when present, the dashboard's dates noted, days staying on screen through a failed or a live reload, the older-days note) and the three copy steps including the box. The phone shows a journal widget as "Shown in the web app"; its Go core changed, so the signed release was rebuilt. Not checked: the clipboard API itself in a browser (the test server is plain http, so only the older copy command ran in the browser; the clipboard path is a component test), the look on a narrow screen, the container (Docker is not run on the Windows PC), and a phone. A dashboard widget listing each day's sessions with their notes, and on the Sessions screen a **Copy as Markdown** button that copies a day's sessions ready to paste into a journal.

**Later phase (not now):**
- plugin data counting in Reskon's totals and charts;
- Reskon telling a plugin what happened;
- tasks pointing at items in an app;
- the food and macros plugin;
- plugin widgets on the phone. The phone can open the web dashboard instead; there is no plan for a phone version.

## 1. Do first

### 1.1 Push the branch and let CI run
- **What:** `.github/workflows/quality.yml` was rewritten (race tests, web lint and tests, 16 KB checks, container smoke test, Trivy file scan, SBOM) but has never run on GitHub.
- **Why:** the first real run will probably need small fixes (an action version, a path, a missing permission).
- **Done when:** every job is green on a pull request. Fix whatever fails, one small commit each.

### 1.2 Run the browser tests in CI
- **What:** the Playwright journeys (`web/e2e/`) only run by hand against the test server on :8097.
- **Why:** nothing stops a future change breaking keyboard access or the accessibility fixes.
- **Idea:** in CI, start the container from the freshly built image with a throwaway account, point `JB_E2E_URL` at it, and run `npm run test:e2e`. Never point CI at a real server.
- **Done when:** a pull request that removes a card's keyboard handler fails CI.

## 2. Decided, not built yet

### 2.1 HTTPS everywhere — **Decided**
- **What:** stop using plain HTTP. Two ways to run, both on the Linux machine:
  1. after each commit, build the Docker image and run it behind **Caddy**, which serves HTTPS;
  2. without Docker, run the binary with **HTTPS and a self-signed certificate**.
- **What changes with it:**
  - the phone must trust the certificate (Android can pin one);
  - the phone's default for a bare address becomes `https://` (`Sync.normalise`);
  - `android:usesCleartextTraffic` is removed from the manifest;
  - `JITTERBUG_SECURE_COOKIE=1` becomes the default;
  - the Dockerfile and a sample `Caddyfile` are added to the repo, and `SPEC.md` and `docs/developer.md` say how to run it.
- **Done when:** the web app and the phone sync over HTTPS only, and `http://` is refused or redirected.

### 2.2 Touch targets on the phone — **Decided: mockups first**
- **What:** pills, tags and some icon buttons are smaller than Android's 48 dp guide (Pill 36 dp, Tag 22 dp, icon buttons 40–44 dp, the "+" in the subtype box 32 dp).
- **Measured on the phone (7 Nov 2026):** most pills and buttons already answer taps in a 48 dp area (Compose widens them), so the real gaps are few: the Board search button (44 wide), the Task screen's property and custom-field rows (43 tall), and the first Area pill in Log session (44 tall). Done already: the choice sheets' rows (Snooze, Move to, Views, Pick a task) are 48 dp.
- **How:** show the owner the measured list, then fix the remaining gaps and add the Compose check (`assertTapAreaAtLeast48`) to each screen.
- **Done when:** every tappable control is at least 48 dp tall and wide (or has an invisible 48 dp touch area), checked with the Compose test for minimum touch size.

### 2.3 Theme colours — **Decided: fix inside each theme**
- **What:** `borderStrong` is about 2.1:1 against the background (a control's outline should be 3:1), and a few colours are written as fixed values (`LevelIcons.tsx` priority colours, `LookupSettings.tsx` status colours, `cycleScale.ts`).
- **How:** change the colour values **in each theme** (`web/src/theme/themes.ts`, the Android `Palette`). Do **not** add code around the theme system.
- **Done when:** each built-in theme passes the contrast check Settings already runs (`checkContrast`), with the border colour included, and no screen hard-codes a colour a theme already names.

### 2.4 Left over from the 2026-11-13 round
- **Tags are finished on every screen.** Reviewed by agents (server, web, phone). Not done, on purpose: the web table's tag chips are not clickable; deleting a tag leaves its id in saved view and widget filters; names fold case for a to z only (see decisions.md).
- **A sync gap found while testing "connect an offline phone" (2026-11-13).** A phone that made an area on its own ("Personal", prefix `PR`) and then connected to a server that already had an area with the same prefix, now deleted (`Personal [deleted #1]`, prefix `PR`, kept by soft delete), does not get that area onto the server (key prefixes are unique), so the tasks made in it never arrive there, silently. Nothing is lost on the phone. Fix idea: when an incoming area clashes on its prefix with a deleted one, free the deleted area's prefix (or merge with it) as the name rename already does; and tell the person when something could not be applied. Needs the owner's yes for the behaviour.
- **Browser journeys:** run against the test server with the `perf` login (set `JB_E2E_URL`, `JB_E2E_USER` and `JB_E2E_PASS` from the login kept in `tools/perf-test-login.txt`, which is not in git, then `npm run test:e2e`): 16 pass, 1 is skipped when the view has no Status column.
- **Touch targets:** the phone's status jump buttons and other pills are 36 dp tall (see 2.2).
- **Push:** the repository has no git remote; add one, then push `phase-2`.

## 3. Dependencies (kept out of the review on purpose)

| Item | Why it is waiting | How to do it |
| --- | --- | --- |
| `golang.org/x/crypto` v0.58.0, advisory GO-2026-5932 | The code never calls the affected function (govulncheck says "not called"); the fix is a pre-release version | Bump when a normal release has the fix, then run `go mod tidy` (this also marks it as a direct dependency, which it is), `make check` |
| Gradle 9.4.1 → newer, `targetSdk` 36 → latest | Needs a full phone-app test pass | Bump one at a time, run lint, unit tests and the device tests |
| `minimatch` advisory in the dev-only lint tools | Not shipped; CI audits production packages only | Upgrade `typescript-eslint` when a release removes it |
| Local `gomobile` says "binary is out of date" | Cosmetic; CI pins the version and the AAR builds | Reinstall the pinned tool from inside `mobile/` |

## 4. The phone app

- **The sync loop is not lifecycle-aware.** It is a loop inside the screen, so it keeps polling while the app is in the background, and a change made just before the app is killed is not synced until the next start. Move it to Android's WorkManager (a scheduler Android runs for you) or tie it to the lifecycle.
- **Screen state is lost when the phone turns or the process is killed.** `ready` and the screen stack are not saved (`rememberSaveable`). Example: rotate on the Task screen and you land back on Today.
- **Checkbox rows and long-press.** Subtask and session rows draw their own checkbox, so TalkBack cannot say "checked"; use `Role.Checkbox` with `toggleable`. Moving a card is long-press only, with no spoken label (`onLongClickLabel`).
- **Level is a bare number to TalkBack** on the board card tag and the task screen's level pills. The session form's level buttons already say "Level 3 of 5". Add the same words ("Level 3 of 5") as on the web.
- **Blank first-load screens.** A failed first load on the Board shows nothing (only a toast). Show an error with Retry, as the web does.
- **A big first download is held in memory several times.** A very large server could run out of memory on the phone. Stream it to a file instead.
- **The core is built for arm64 only.** An x86_64 emulator cannot load it. Either add an `android/amd64` target or document that tests need an arm64 image or a real phone.
- **Back up the Reskon signing key.** The release is signed with `X:\Personal\Keys\reskon-release.jks`. If that file or its passphrase is lost, installed copies can never be updated. Keep a copy off this PC.
- **Smaller:** the KTX lint hints, `mutableDoubleStateOf` hints.

## 5. The web app

- **Five `react-hooks/exhaustive-deps` warnings** (`LookupSettings.tsx`, `IconPicker.tsx`). Each needs a look, because adding the missing dependency can change when the effect runs.
- **Totals worked out in the browser.** AGENTS.md says totals come from the server. Still in the client: the Sessions "in total" line, the Inbox ages (from the clock), the WIP sums in `limits.ts`, and the capture modal's hours total. Move each into the API.
- **The Sessions screen asks the server once per day shown** (`/day/:d`). "Everything" and "Last 12 months" can mean hundreds of requests. Add one server call that returns all the day totals.
- **The task-names fetch on the Sessions screen swallows errors.** If it fails the "What" column shows `task #12`. Show a note.
- **The bulk task picker shows the task key.** SPEC says the key is shown only in the task panel (search by key is allowed). Decide whether the picker counts as search.
- **Minor `axe` items:** an empty table header cell and Ant Design's hidden measuring row being focusable. Low priority.
- **A guess never checked:** the row delete button disappears while its confirmation is open (`.jb-rowdel`). Open the confirmation with the mouse and see.
- **Light theme — owner decision.** Both apps are dark only.
- **Full Content-Security-Policy.** Only `frame-ancestors 'none'` is sent. A full policy needs testing in a real browser against Ant Design's inline styles.

## 6. The server

- **The move log is append-only by habit, not by the database.** There is no trigger stopping an UPDATE or DELETE on `status_transition`. Sync is now guarded, but an additive migration could add triggers that refuse both, plus a test.
- **`PatchDay` reads the old feedback before it opens its transaction.** Two edits at the same moment could overwrite each other. Move the read inside.
- **Migration tests are thin.** Only some migrations have a test that upgrades real data. Add: a small database file from the previous release kept as a fixture, a test that opens it and checks the rows survived, a check that `PRAGMA user_version` equals the number of migrations, and a start-from-every-version test.
- **More tests the QA review asked for:**
  - "Capture never writes": call the capture endpoint with the model unreachable and check no task or session rows changed.
  - Sync conflicts: same field edited on both sides, stamped and unstamped, for tasks, areas and sessions (today only views and a different-field case are covered).
  - Phone core (`jbcore`): wrong password, expired cookie, unreachable server, corrupt data folder.
  - Fuzz the request decoders and the capture parser.
- **Capture endpoint reach — owner decision.** A signed-in person can point capture at any address, including one on the home network (needed for local models). The server no longer leaks its key, follows redirects or echoes answers. Options if you want stricter: admins only, or an allow-list.
- **Setup token on by default? — owner decision.** It is optional now (`JITTERBUG_SETUP_TOKEN`).
- **Sign-in limits against many addresses.** A determined attacker using many addresses is not stopped; a long password is the defence. Look again if the server ever faces the internet.
- **Data file permissions.** Folders are 0700 but SQLite files use the default mask. Set the mask in the container.
- **Dockerfile `HEALTHCHECK`.** Trivy's only finding. Needed anyway for Caddy. Can now be tested on the Linux server.
- **More checks the toolchain doc lists but nothing runs yet:** a ZAP baseline scan against a throwaway server, Maestro flows, Macrobenchmark.

## 7. Tools and the machines

- **Windows `PATH`:** the old 32-bit `C:\MinGW\bin` is first, so a plain `go test -race` fails there. Put the LLVM-MinGW folder before it, or remove the old one.
- **`go vet ./...` and `go test ./...` also walk `web/node_modules`**, which now contains a Go package (from ESLint's tooling). Harmless, but noisy. Either run them on `./cmd/... ./internal/...` or add a `go.work` that excludes it.
- **The Linux disk is 96% full** (about 4 GB free) and Docker's build cache holds about 9.4 GB reclaimable. `docker builder prune` would free it; it also removes other projects' cache, so it is an owner call. The server also runs unrelated containers (affine, webstudio, openproject): never prune images or volumes there.
- **Playwright and the phone tests need a test server and a spare phone.** `tools/ship/jbcheck.sh` and `jbclean.sh` (git-ignored) run the container check on the Linux host.
- **`.vscode/settings.json` is not committed** (personal editor colours). Commit it or add it to `.gitignore`.

## 8. Test result history

Last full pass (see the end of the `phase-2` commits): Go format, vet, tests, race, lint, govulncheck clean for both Go modules; web typecheck, ESLint (0 errors), 20 component tests, 11 browser tests; Android lint 0 errors, 27 unit tests, 19 on-device tests, 16 KB alignment; Trivy file scan, base image and built image clean; container built, started empty, restarted on its data and signed in.

## Day Planner (built in 0.6.0)

The Day Planner shipped in 0.6.0 on the server, web and phone; SPEC.md section 8.3 describes it and `docs/decisions.md` records the choices. Tested on the test server in the browser and on the test phone: plan totals and over-warning, weekday available time, event timer to session (event done), second start refused, a stopped timer kept through reload until saved, timer surviving the app being killed and syncing to the web, Bring forward copying without touching the earlier day. Empty and existing databases checked bare and in the container.

Left for later:
- The calendar view with planned counts per day (`GET /api/days` exists; no screen uses it yet).
- Phone reorder is Move up/Move down, not drag.
- The Available tasks list is filtered on the client because the tasks API has no status filter (see decisions.md).
- Time-of-day blocks and calendar integration (deferred by the owner).
