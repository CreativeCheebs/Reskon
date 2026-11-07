# Next phase: what is still open

Everything here is something the review and fix round (branch `phase-2`) did **not** finish. Each item says what it is, why it matters, and how you will know it is done. Items the owner has already decided are marked **Decided**; the rest still need a decision or a first look.

Where a choice is recorded, it is in [`decisions.md`](decisions.md) (the "Open questions" part). This file is the to-do list; that file is the reasoning.

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
  - the Dockerfile and a sample `Caddyfile` are added to the repo, and `SPEC.md` and the README say how to run it.
- **Done when:** the web app and the phone sync over HTTPS only, and `http://` is refused or redirected.

### 2.2 Touch targets on the phone — **Decided: mockups first**
- **What:** pills, tags and some icon buttons are smaller than Android's 48 dp guide (Pill 36 dp, Tag 22 dp, icon buttons 40–44 dp, the "+" in the subtype box 32 dp).
- **How:** draw mockups of the affected screens (Board, Log session, Sessions, Task), agree them, then change the sizes. Do not resize in code before that.
- **Done when:** every tappable control is at least 48 dp tall and wide (or has an invisible 48 dp touch area), checked with the Compose test for minimum touch size.

### 2.3 Theme colours — **Decided: fix inside each theme**
- **What:** `borderStrong` is about 2.1:1 against the background (a control's outline should be 3:1), and a few colours are written as fixed values (`LevelIcons.tsx` priority colours, `LookupSettings.tsx` status colours, `cycleScale.ts`).
- **How:** change the colour values **in each theme** (`web/src/theme/themes.ts`, the Android `Palette`). Do **not** add code around the theme system.
- **Done when:** each built-in theme passes the contrast check Settings already runs (`checkContrast`), with the border colour included, and no screen hard-codes a colour a theme already names.

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
- **Intensity is a bare number to TalkBack.** Add the words ("Intensity 3 of 5") as on the web.
- **Blank first-load screens.** A failed first load on the Board shows nothing (only a toast). Show an error with Retry, as the web does.
- **A big first download is held in memory several times.** A very large server could run out of memory on the phone. Stream it to a file instead.
- **The core is built for arm64 only.** An x86_64 emulator cannot load it. Either add an `android/amd64` target or document that tests need an arm64 image or a real phone.
- **Release signing key.** The release build is signed with the debug key. Make a real key before anyone installs a release over an older one. **Owner decision.**
- **Smaller:** an app icon (lint: `MissingApplicationIcon`), the KTX lint hints, `mutableDoubleStateOf` hints.

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

Last full pass (see the end of the `phase-2` commits): Go format, vet, tests, race, lint, govulncheck clean for both Go modules; web typecheck, ESLint (0 errors), 20 component tests, 11 browser tests; Android lint 0 errors, 8 unit tests, 5 on-device tests, 16 KB alignment; Trivy file scan, base image and built image clean; container built, started empty, restarted on its data and signed in.
