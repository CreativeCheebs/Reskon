# Reskon: what it does and how it works

This is the one description of Reskon. It says what the app does today and what is planned next. It replaces the old Phase 1 and Phase 2 build specs, the change documents (001, 002, 003), the list of deviations and the schema notes. Why things were chosen, and the questions still open, are in [`docs/decisions.md`](docs/decisions.md).

When the app changes, this file changes with it, in the same commit. If the code and this file disagree, one of them is wrong: fix it, don't leave a note.

---

## 1. What Reskon is

Reskon is a task board and a time log for one person's life: work, health, home, hobbies, rest. You keep your tasks on a board (like Jira or Trello), you log the time you spent on things (like a timesheet), and the app shows you what your days and weeks actually looked like.

It runs on your own computer or home server. It is one program (one file). Several people can use the same server, and each person's data is kept in their own separate database file.

There is also an Android app. It works completely on its own, with no server and no internet. You can connect it to your server later, and then the phone and the server keep each other up to date.

### The ideas everything follows

1. **Everything counts.** Sleep, games and a walk earn points just like coding does. No kind of activity is worth more than another by default.
2. **Types are never subtracted or divided.** The app never shows "work minus rest", "work ÷ rest", a "balance", "net energy" or a "productivity rate". Adding things up is fine. A test (`TestNoMetricNetsEnergyTypes`) makes sure no such number is ever added.
3. **No targets, streaks or grades.** The app shows counts and facts, not judgement. A warning appears only when you go over a limit you set yourself.
4. **The server does the maths, in one place.** Every number that is worked out from other data (ages, points, progress, totals) is calculated by the Go code and sent to the screen. The web page and the phone only show it. They never calculate it again themselves.
5. **History is kept.** Every status change is written down and never edited. Deleting most things only hides them, so old records still make sense.
6. **Nothing is guessed silently.** When something is unclear, the app asks or leaves it blank.
7. **Your lists are yours.** Statuses, priorities, energy types, subtypes and areas are all rows you can rename, recolour, add and delete. The code never checks for a name like "Done". It checks what kind of status it is (its "behaviour").

---

## 2. Words used in this document

| Word | Meaning |
| --- | --- |
| **Area** | A part of life a task belongs to: Main job, Personal, Health… Each task has exactly one. The area gives the task key its prefix (`PER-12`). |
| **Task** | Something to do. It has a status, and can have a priority, level, estimate, dates and more. |
| **Epic** | A big task that groups other tasks (for example "Android app"). |
| **Subtask** | A small task inside another task, shown as a checklist on its parent. |
| **Status** | Where a task is: Backlog, To do, In progress, Done, Cancelled, or your own. |
| **Behaviour** | What a status means to the app: *to do*, *in progress*, *done* or *cancelled*. Every status has one. |
| **Session** | A piece of logged time: "2 hours on the tax receipts, yesterday". |
| **Task / Event** | A session is either a task session (time spent on work or anything else you do on purpose) or an event: something that happened to you (a meal, a nap, time with family). Called "Work / Event" before; the database still stores `task` or `event`. |
| **Energy type** | What kind of effort a session was: Engineering, Physical, Admin, Rest, Leisure, or your own. |
| **Subtype** | A finer kind inside an energy type: coding, cardio, paperwork… Optional. |
| **Level** | How much a session or task took, from 1 to 5. It is only a number, with no word like "intense" attached, so it suits rest and play as much as work (a good nap can be level 5). In the code and database it is called `difficulty`; before it was called intensity. |
| **Points** | A number earned by a session: hours × the energy type's points per hour × level. |
| **Buff / debuff / modifier** | Something going on in your life that affects your days: a debuff makes things harder (a cold), a buff makes them easier (a new routine), a modifier is neither (travelling). Together they are called **states**. |
| **View** | A saved way of looking at tasks: which tasks (filter), how they look (card settings), and as a board, list or timeline. |
| **Dashboard / widget** | A page of charts. Each chart is a widget. |
| **Day plan / ceiling** | Your morning plan. A ceiling is the most hours you plan to spend on an energy type today. |
| **Inbox** | A place to drop a quick line and sort it out later. |

---

**Your own words for task and epic.** This document says *task* and *epic* everywhere. Settings › Names (web and phone, one setting on the account) lets a person pick other words for what the screens show, such as *todo*/*todos* or *story*/*stories*. Four words: one task, several tasks, one epic, several epics, each 1 to 24 letters, digits, spaces, hyphens or apostrophes. Write them in lower case; the first letter is raised where a label or sentence starts, and the rest is left as typed. Only what is displayed changes. The API, the database, the key (`PER-12`), error messages from the server, the capture model's instructions and this document keep saying task and epic. The Task / Event switch on a session uses the same word. Two things are not renamed: the words *subtask* and *Subtasks*, and the names and descriptions of the built-in chart measures such as "Open tasks", which come from the server.

---

## 3. People and signing in

- The first person to open a new server creates the **admin** account. After that there is no open sign-up: only an admin adds people (Settings › People).
- A server can ask for a **setup token** before it makes that first account. The person who starts the server sets `JITTERBUG_SETUP_TOKEN` and types the same word on the first-run screen. Without it, anyone who can reach a brand-new server could claim it, so the server writes a warning to its log while no account exists and no token is set.
- An admin can reset a password, make someone admin, or disable an account. A disabled person can't sign in, and their data stays. Accounts are never deleted. The last admin can't be demoted or disabled.
- Everyone can change their own password (Settings › Account). Changing it signs you out on your other devices.
- **Each person has their own database file** on the server. One person's data can never show up in another person's screens. This is how the code is built, not just a filter.
- Signing in keeps you signed in for 30 days, renewed while you use it. Five wrong passwords for a username **from the same computer** lock that name for that computer for 15 minutes, so someone else's wrong guesses cannot lock you out. Thirty wrong passwords from one computer, whatever names it tries, lock that computer out for 15 minutes. Changing your password (it asks for the current one) is limited the same way.
- Settings (capture model, subtype weights and so on) belong to each person, because they are stored in that person's database.

---

## 4. Tasks

### 4.1 Keys

Every task gets a key when it is created, made of its area's prefix and a number: `PER-1`, `PER-2`, `OM2-114`. Numbers count up per prefix and are never reused, even after a task is deleted. Moving a task to another area doesn't change its key.

**The key is only shown in the task panel**, never on cards or in lists. It is for linking and searching, not for reading.

### 4.2 Areas

- Every task has exactly one area. A new server has no areas; the first thing you do is create one (the phone does the same on first start).
- Creating an area also creates a board view for it.
- An area has a default energy type. A new task in that area starts with it, and you can change it.
- When you create a task from a board, it takes the area of that view. If the view shows several areas, you pick one (the last one used is preselected).

### 4.3 Statuses

- Seeded statuses: **Backlog**, **To do**, **In progress**, **Done**, **Cancelled**. All five are built in: they can be renamed and recoloured, but not deleted.
- Each status has a colour, a position and a behaviour (*to do*, *in progress*, *done*, *cancelled*). You can add your own statuses.
- A status can be **hidden from the board** (Backlog and Cancelled are). Hidden statuses open from small buttons next to the search box, as the view's own list (see 5.4) over the board, narrowed to that status, with the same columns, grouping, sorting, status buttons, right-click menu and bulk actions, and a **To to-do** button on each row. These buttons (and Snoozed, Blocked, Incomplete) show only when they have at least one task. Taking a task out of the backlog puts it in the first visible *to do* status.
- A status can have **"alert after N days"**: a task that has sat in it longer is marked as stalled (a red edge on its card). Empty means never.

### 4.4 Moving a task

- Every status change writes a row in the **transition log**: from which status, to which, and when. The change and the log row are saved together or not at all. The log is never edited or deleted.
- Moving a task is its own action, separate from editing it, so the log can't be skipped.
- Moves don't check for conflicts. The last move wins.
- Cards in a column keep their order using a number between their neighbours (dropping between two cards takes the halfway point). When two cards get too close (less than 0.000002 apart), the column is renumbered.
- You can move many tasks at once from the list view (tick them, pick a status). Each gets its own log row.

### 4.5 Dates and ages, all worked out from the log

These are never stored. They are worked out every time a task is read, from the transition log:

| Value | Meaning |
| --- | --- |
| Created age | How long the task has existed. |
| Started age | How long since it first went into an *in progress* status. |
| First started / last started | The first and latest time it went into *in progress*. |
| Completed | When it last went into a *done* status. Moving from one done status to another keeps the date. Moving out of done clears it. |
| Cancelled | The same, for *cancelled*. |
| Time in status | How long it has been in its current status. |

### 4.6 Start, end and due dates

- **Start date** and **end date** are stored dates you can set by hand. A move can fill them in (Settings › Task dates): by default, moving into *in progress* fills an empty start date, and moving into *done* or *cancelled* fills an empty end date. Moving back to *to do* or *in progress* clears an end date the rules filled in. Each rule can be turned off or set to other statuses.
- Tasks that were already in progress before start dates existed got the date they first moved into progress.
- **Due date**: set by hand.
- From the due date the app works out **days to due** (0 = today, negative = overdue) and **pace**: the hours a day you need to finish in time ("about 2h 15m a day to finish by Tue"). Pace is empty once the task is finished. On board cards the pace is a small chip beside the other chips ("≈ 2h 15m/day by Tue", or "3h to do today" in amber), so it never adds a line and cards keep an even rhythm; an overdue card shows only its "Overdue" chip. The task panel and tables keep it as a line under the time bar.

### 4.7 Estimate and progress

- **Estimate** is the hours you expect the task to take.
- **Logged** is the hours of all sessions on the task.
- **Progress** = logged ÷ estimate. It can go past 100%. When you've logged more than estimated, the bar turns red, a warning sign appears, and it says by how much in red ("⚠ 6h / 2h · +4h over"). The tooltip adds the percentage ("300% of the estimate"). A done task that stayed within its estimate shows a full green bar and how much under it came in ("2h / 4h · done, 2h under"); a cancelled one shows a full grey bar.
- **Remaining** = estimate − logged. It goes negative once you're over.
- A task with subtasks shows its own logged hours and, below, **the total including its subtasks**.

### 4.8 Priorities and level

- Priorities are rows (seeded **Low 0.75**, **Normal 1.0**, **High 1.5**). Each has a colour and a weight. With no colour, a priority gets one by its rank: blue for the lowest through green, yellow, orange to red for the highest. You can add more; built-in ones can't be deleted.
- **Level** is 1 to 5, shown as 1 to 5 slanted lines (one line for level 1, five for level 5) in a colour that goes from pale to deep blue. There is no red: a restful level 5 is not a warning. The number is written beside it, so nothing depends on the colour.
- A task's own points (shown on the task) are **level × priority weight**. No level means no points. No priority counts as 1.

### 4.9 Epics

- An epic is a task of type *epic*. Ordinary tasks can belong to one epic. An epic can't belong to an epic.
- An epic shows how many of its tasks are done, the sum of their estimates, and the hours logged on them, including their subtasks' hours. Cancelled tasks count for hours (the time was spent) but not for done or estimate.
- Deleting an epic keeps its tasks; they just lose the epic.

### 4.10 Subtasks

- Three levels, like Jira: epic → task → subtask. A subtask is a full task (own key, status, sessions) with a parent. A subtask can't have subtasks. An epic can't be a subtask.
- **A subtask has no epic of its own.** It belongs to its parent's epic, and its hours count in that epic's total.
- Views leave subtasks out unless the filter's "Subtasks as cards" is on. The parent's card shows "2/5 subtasks" (done of total), and its panel lists them as a checklist. Ticking moves a subtask to the first *done* status; unticking moves it to the first *to do* status.
- **Deleting a task with subtasks asks** whether to delete the subtasks too, or keep them as normal tasks.

### 4.11 Dependencies

- A task can be **blocked by** another ("A must finish before B"). A link that would make a loop is refused.
- A task is **blocked** while any task blocking it is still open. Blocked tasks are listed under a **Blocked** button instead of on the board (a view can choose to show them).

### 4.12 Snooze

- Snoozing hides an open task for some days without changing its status. Only *to do* and *in progress* tasks can be snoozed (Backlog included). The longest snooze is a setting (default 30 days, 1–365).
- Snoozed tasks are listed under a **Snoozed** button with the day each comes back, and a **Wake now**.
- A task can also be snoozed **until its blockers are done**.
- Waking is worked out from the date, so nothing runs on a timer. Moving a task to *done* or *cancelled* clears its snooze.

### 4.13 Complete details

Settings › Complete details lets you choose fields an open task should have (start date, end date, due date, estimate, level, priority, energy type, description, epic). An open task of type *task* missing one of them is **incomplete**: views show an **Incomplete** button listing them with what each lacks, and the task panel says what's missing. Done and cancelled tasks, epics and snoozed tasks are never listed. With nothing chosen, there is no Incomplete button.

### 4.14 Deleting a task

Deleting a task hides it (its key stays used). Its sessions stay, without a task. A deleted task blocks nothing. Deleting an epic does not delete the tasks in it: they stay, just no longer in that epic. Deleting one task asks yes or no (a task with subtasks also asks whether they go too). Deleting **several at once** from the table has no undo, so the box lists what goes and asks for the word *delete* to be typed out by hand (pasting is blocked). All of them are deleted or none (`POST /api/tasks/delete`); subtasks stay as ordinary tasks unless the box is ticked.

### 4.15 Editing at the same time in two places

- When you save a task, the app sends the "last changed" time it saw. If the task changed in the meantime (another tab), the server answers "conflict" with the current version, and the screen applies your change on top of it.
- **Sessions** don't warn. Each field keeps its latest change, between tabs and between devices (the same way Todoist works).

---

## 5. Board, list and timeline (views)

A **view** is a saved way of looking at tasks: a filter, card settings, a layout and how it looks. "Main job", "Personal" and "Everything" are views, not filters you click each time.

### 5.1 Filter: which tasks

- Areas, statuses, minimum level, types (task/epic), epics (including "no epic"), custom field values (exact value, empty, or a range of dates or numbers), open tasks only, subtasks as cards.
- **Hide done after N days**: only tasks finished in the last N days show in the done column, so it doesn't grow forever. It can be changed at the foot of the done column.
- The filter runs on the server. The screen sends which view, never the filter itself. An unknown filter key is refused, so a typo can't quietly match everything.
- Search inside a view: every word must appear in the title, key or description, and the view's filter still applies.

### 5.2 Card settings: what a card shows

Per view: area, created age, started age, time in status, level, priority, energy type, subtypes (of sessions logged on the task), estimate, time bar with pace, due, start, end, epic, logged time, and chosen custom fields. Density: compact or comfortable. Lists can show priority and level as symbols only. Board cards never show the status (the column already does). A task's symbol is a blue page and an epic's a purple bolt; neither is a tick-box, so nothing on a card looks done unless it is. Changing these changes that view only.

### 5.3 Board

- Columns are the visible statuses. Drag cards to move or reorder them. From the keyboard, Tab to a card, **Enter opens it**, **Space picks it up**, the arrow keys move it, Space drops it and Escape cancels; a screen reader announces the task title and the column it is over.
- **Grouping** makes swimlanes (by epic, priority, area, energy type, level, type or status). Cards move between columns inside their lane, not between lanes. A task created in a lane gets that lane's value.
- **Sorting**: manual (default), priority, due, level, estimate, time in status, newest, oldest. While sorted, you can still move cards between columns.
- **Collapsed columns** are shared by every lane and still accept drops.
- **Column limits** per status: a maximum in tasks, points or estimate hours. A soft limit colours the header. A hard limit asks "Move anyway?" before a drag takes the column over. Limits are stored with the view and sync.
- Cards show priority, level, time in status and due date as small chips with text (the level chip says "Level 3" beside its lines). A coloured edge marks stalled (red) or overdue (amber) cards.
- **Card actions**: Log time, Snooze, Note, Move to, Open task, Delete. Settings › Card actions chooses which are buttons on a hovered card (up to 3; default Log time and Snooze) and which are in the right-click menu on cards and table rows (default all). On the phone, long-press a card to move it.

### 5.4 List (table)

The same view as a table, with the same filter and the same field choices as columns. Rows start sorted by time in status, longest first (the "aging" list). Tab reaches each row and Enter or Space opens it. Sorting by area sorts by the area's name. Rows can be grouped (including by status) and ticked for bulk actions: move to a status, or delete (see 4.14). The **status** of each row is a button that opens the list of statuses; choosing one moves the task (and writes its history) and does nothing else. **Right-click a row** (or press the keyboard's menu key on it) for the same menu as a board card's right-click menu: Settings › Card actions chooses which items it lists, one setting for cards and rows alike; with none chosen the browser's own menu shows. Column widths can be dragged and are remembered in that browser only.

### 5.5 Timeline

A third layout beside board and list: one row per task under its epic, a bar from start date to end date. A task with only one of start, end or due gets a one-day bar. Tasks with no dates are counted above it. Read only for now.

### 5.6 Look

A view has an icon (emoji, or an icon from Fluent UI or PrimeIcons), a colour, and an optional background image (PNG, JPEG, GIF or WebP, up to 8 MB, stored in your database) with fit, opacity, blur and how see-through the columns are. Cards stay solid.

### 5.7 Seeded views

**Everything** (a list of all areas) is seeded, plus one board per area you create. The seeded **Stuck** view is hidden until it is designed in the next phase.

---

## 6. Sessions (the time log)

### 6.1 What a session holds

- **Hours** (more than 0, at most 24), the **date** it was for, and optionally a **start time**.
- **Description** (shown as the session's title), an optional **task**, an **area**, and **task or event**.
- **Energy types**: one, or up to four with shares in whole percents that add up to 100% ("70% Engineering, 30% Admin"). Each part has its own level. An hour is never counted twice, so a day can't pass 24 hours.
- **Subtypes**: up to four, ranked by dragging, or with the keyboard (focus the handle, Space, arrow keys). Each has a Remove button. Rank weights are a setting (default 100%, 50%, 25%, 25%). Percentages are never typed.
- A **note**, and custom fields.
- Points (below), and when it was created and last changed.

### 6.2 Where the energy type comes from

| Case | Preselected energy type |
| --- | --- |
| Session on a task | the task's |
| Session without a task | the area's default, else you pick |
| New task | the area's default |

Choosing a task also fills in its level, unless you set one yourself. You can always change it.

### 6.3 Points

- Each part of a session earns **hours × share × the energy type's points per hour × level**. The level is the part's, else the task's, else 1. A session's points are the sum of its parts.
- Every energy type starts at **1 point per hour**. You can change a rate in Settings › Energy types.
- Points are **saved when the session is logged**, so changing a rate later doesn't change old sessions.
- **Editing a session** that changes its hours, level, energy types, shares or task saves fresh points at today's rates. Editing only the note doesn't.
- When only a rate has changed since, the session shows what it **would earn today** and offers **Recalculate** (one session, or many from the bulk bar).
- Points can't be typed by hand in the app. (The API still accepts them, for imports.)

### 6.4 The Sessions screen

- Filters: dates, energy type, area, task, task/event, has a task or not, has a level, has subtypes, and words. All filtering is done on the server.
- Days show their totals per energy type, from the server.
- **Bulk changes**: tick sessions (or whole days, or all shown) and change their energy type, task/event, area, level, date or task, or delete them. All or nothing. Detaching from a task keeps the task's title as the description; attaching takes the task's area.
- The log form takes a duration like `1h 30m`, `90m`, `1.5` or `1:30`.
- **Enter saves.** In the Log time and Edit session forms, Enter in a one-line box (duration, date, start time, description) saves, the same as the Save button, once the form is complete. It does not save from the note (Enter starts a new line), from a button, while a drop-down or date pop-up is open (Enter picks the choice there), or while a word is being composed. On the phone, the keyboard's Done key in the duration and description boxes saves.

---

## 7. Quick capture and the inbox

### 7.1 Quick capture

- One typed or spoken line becomes a task or one or more sessions. It opens from a round + button on every screen, or **Ctrl/⌘+K**.
- **This is the most important screen.** If capturing takes more than a few seconds, people stop logging, and every other screen goes empty.
- An AI model reads the line ("Worked on stm32 demo, 2 hours" → a 2-hour Engineering work session; "Need to order a new NVR drive" → a task). The model chooses only among your real areas, energy types, subtypes and open tasks. It can't invent them.
- **The AI decides whether the line is a task or a session.** Until it does (or when there is no AI), nothing is picked and you choose.
- **Nothing is saved until you confirm.** The answer becomes a filled-in form you can change. One line can become up to 6 entries ("6 hours at the hospital, work was only 1 of them" → a 1-hour work session and a 5-hour other session). Saving goes one by one; if one fails, only the unsaved ones stay.
- The model writes a short title; the line as typed is kept in the session's note. It sets level when the line says how it felt, and an area only when the line makes it clear. A task without an area gets the last area used.
- **Capture never fails because the AI is down.** Only the first 40 different words of a long note are used to look for similar open tasks, so even a pasted page works. With no model set, or one that is slow (over 5 seconds) or broken, it falls back to the plain form with your line in it, and says why.
- The line and the AI's answer are kept on the saved session or task (in `custom._capture`), so a wrong answer can be checked later.
- The model is any OpenAI-compatible service, set per person in Settings › Quick capture (endpoint, model, key). The server's `JITTERBUG_LLM_*` settings are used when a person hasn't set their own. **The server's key only goes with the server's own endpoint:** a person who types a different endpoint must also give their own key, so no one can send the server's key to an address of their choosing. The server does not follow redirects from the endpoint, and when it fails the message shows only the status number, not what the endpoint answered. The key is never sent back to the screen.

### 7.2 The inbox

- **Ctrl/⌘+I** anywhere (or the phone's Inbox tab) adds a bare line to the inbox.
- **Process** opens quick capture with that line. The line leaves the inbox only once what it became is saved. **Discard** removes it.

---

## 8. The day screen

A fixed screen with two halves, because its job is the same every day.

**It is offered only while it is switched on.** Settings › Screens (web) and Settings › Screens (phone) have one **Day screen** switch, saved on your account so both agree and syncing like any other setting. It is off until someone turns it on. Off removes Day from the web sidebar and the phone's Today tab, an old `#/day` web link opens the first view instead, and the phone opens on Board; if it is switched off while the phone is on Today, the phone moves to Board. Nothing is deleted, and turning it on again brings everything back.

### 8.1 Morning: the plan

1. **Focus**: which areas today is for.
2. **Ceilings**: the most hours you plan for any energy type, each optional, set with + and −.
3. **In force**: your buffs and debuffs, shown, not entered. Seeing "poor sleep, day 2" before planning is the point of this screen.

The plan is carried forward from your last plan, so most mornings are one tap (**Keep this plan**) or none. Nothing is saved until you tap Keep or change something.

### 8.2 Evening: the readout

- Per energy type: planned ceiling and hours actually spent, on one scale, with a white mark at the ceiling. A warning shows only when a type went over a ceiling you set. A type without a ceiling never warns.
- **"Were today's ceilings about right?"** for each type that had a ceiling: Too low, About right, Too high. Tap again to clear. It can be answered or changed any time.
- **"Too high"** makes the next three mornings suggest 80% of that day's ceiling for that type, then eases back over four days (85, 90, 95, 100%), rounded to quarter hours. Holding a lower number is normal, not a setback. **"Too low"** only cancels a "too high" hold. Any later answer ends the hold.
- Days are never locked. Any day can be edited at any time.

---

## 9. Buffs and debuffs (states)

- You add a state with a name (your own words), a kind (buff, debuff, modifier), a severity (0 to 5 in half steps, each step with a name, from "none" and "very mild" up to "unbearable" or, for buffs, "peak"), a start date, an optional duration and a **decay shape**:

| Shape | What happens over its duration |
| --- | --- |
| Holds (static) | Stays at full severity until cleared. The default. |
| Linear | Fades evenly. |
| Fast | Drops quickly at first, with a long tail. |
| Slow | Lingers, then drops away. |

  The form shows a small sketch of each curve.
- **Severity now** is worked out on read from the shape and the days passed. It shows next to the original when different: "1.4 (from 4)". Without a duration, decay is ignored.
- **Reaching zero doesn't clear a state**, and passing its duration doesn't either. It shows as "ended, not cleared" until you clear it. A cold set for 7 days that is still there on day 12 must not quietly disappear.
- Clearing sets the day it ended. Delete is offered once cleared.
- **Colours**: a debuff goes from yellow (mild) to red (severe), a buff from blue (mild) to green (strong), a modifier stays blue. Each state has a ring symbol filled by its severity.
- States in force show as chips along the top of every screen.
- **A state never changes any number.** It sits beside the numbers and explains them.

---

## 10. Dashboards and charts

### 10.1 How it works

- A dashboard is a page of widgets on a grid (12 columns). Edit mode is a switch, so nothing moves by accident while you read. In edit mode, drag and resize; the layout saves when you drop.
- Every widget is **a question to the metrics API plus a way to draw it**. No widget has its own special code. Adding something new to measure is one entry in the metric list; adding a new chart type is one drawing component.
- Each widget loads when shown and has a refresh button. No background polling.
- A dashboard can run every widget over one chosen day or a span of dates instead of each widget's own range. That choice isn't saved.
- On a narrow screen (under 768px), widgets stack in one column in saved order, with no editing. A chart too narrow to read shows as a single number instead. The Android app shows dashboards this way.

### 10.2 Chart types

Bar, line, cumulative (only rises), number, list, bands (states across days, drawn as spans), split bar (stacked), share bar (each day stacked to 100%), pie, table, and small multiples (one small chart per energy type, each with its own scale, never added together).

### 10.3 Metrics

| Metric | What it measures |
| --- | --- |
| Session hours | Hours logged. |
| Points | Points stored on sessions. |
| Sessions | How many sessions. |
| Tasks closed | Tasks moved into done, by the day they were completed. |
| Open tasks | Tasks open now. |
| Time in status | How long open tasks have sat in their status. |
| Cycle time | Hours tasks spent in each open status. |
| State days | Buffs and debuffs across days. |
| Days over plan | Days where any type went over its ceiling. |
| Ceiling vs actual | Hours as a share of the planned ceiling, per type. |

- Each metric says which groupings (day, week, month, area, subtype, energy type, status, task, session…) and filters (area, energy type, subtype, status, task/event, task) it allows. The widget editor only offers what the server supports.
- Ranges: today, 7 days, 30 days, 90 days, this month, 1 year, all, or chosen dates.
- Weeks start on the day set in Settings › Reflection (default Monday).
- Totals, running totals and shares come from the server, never added up on screen. A share is a part of the sum of all types, never one type divided by another.
- By subtype, hours and points carry the subtype's rank weight.
- Epics are left out of task metrics. Snoozed tasks are left out of time in status.
- An empty range returns no points and the widget shows "no data", not an error.

### 10.4 Seeded dashboards

**Today**, **This month** and **The year**, all editable and deletable, with charts of hours, points and shares by energy type, conditions, counts and days over plan. Drift and Stuck work are hidden for now.

### 10.5 Why not Grafana

See decisions. In short: it would be a second program to run, embedding it securely is fiddly, and it is built for alerts and thresholds, which this app avoids.

---

## 11. Search

- **Duplicate search** runs as you type a task title (in a column's add box, in quick capture, in a view's search) and lists tasks that look the same. It matches by words (word stems, the word still being typed, one typo) in titles **and descriptions** (a description match ranks just below the same title match). With the small meaning model downloaded, it also matches by meaning ("stomach acid" finds "heartburn diagnosis"). Matching by meaning reads titles only.
- The meaning model (all-MiniLM-L6-v2, about 90 MB) runs inside Reskon, offline. An admin downloads it once in Settings › Duplicate search. Without it, word matching works alone. The phone has word matching only.
- **Global search**: press `/` or open Search. It uses duplicate search plus exact task keys (typing `JB-42` opens that task).

---

## 12. Settings

| Group | What you set |
| --- | --- |
| Workflow | Areas (name, key prefix, colour, default energy type), statuses, priorities, task dates, snooze, complete details, card actions, custom fields |
| Time and points | Energy types (name, colour, points per hour), subtypes, subtype rank weights, reflection (week start) |
| Connections | Quick capture model, duplicate search model, sync server (phone) |
| Data | Download database (phone) |
| You | Screens (the Day screen switch), Names (what tasks and epics are called), About (the version), Appearance (themes: Default, Jira, Jira high contrast, GitHub Dark, GitHub Dark Dimmed; download one as a file, edit it, upload it; in any theme, grey secondary text is lightened just enough to be readable, at least 4.5:1 on every surface), account |
| Admin | People |

### 12.1 Deleting something that is in use

Areas, statuses, priorities, energy types and subtypes all work the same way, like Jira:

- If nothing uses it, it is deleted straight away.
- If something does, the app says what ("used by 12 tasks, 3 sessions") and asks where to move them. Then it moves them and deletes.
- Statuses: each moved task gets a log row ("status deleted"), and its time in status starts again. Priorities can also be cleared instead of moved.
- Energy types: tasks, sessions, subtypes and area defaults all move. A session that already has the chosen type gets the two parts joined.
- Built-in rows can't be deleted. A deleted row is hidden and renamed `name [deleted #id]`, so the name can be used again.
- Deleting an area keeps its board view. Delete the view yourself if you don't want it.

### 12.2 Custom fields

- Extra fields on tasks or sessions, with no database change needed: text, whole number, number, date, yes/no, or a choice from a list. They show in the task panel and the session form, and can be used in filters and on cards.
- A field's key and type never change. To change a type, make a new field.
- Values are checked against the field's type (a date must be `YYYY-MM-DD`). Values the app doesn't recognise are kept, never removed.
- Every field gets its own index, so filtering by it stays fast with many tasks.
- **A deleted field's key can be used again.** Doing so removes the old field and its values for good, and the new field starts empty.

### 12.3 Importing from Jira

`jitterbug import-jira <export.db> <username> [--dry-run]` copies a Jira export into a person's data in one go (a dry run reports and changes nothing). Keys are kept (`OM2-N`). Labels become areas, and `--area label=Name` sends a label to an existing area. Statuses, priorities and difficulty map to Reskon's, creating the missing ones (Planned, Paused, Highest, Lowest). The status history becomes the move log, so dates and cycle time are Jira's real history. Worklogs become work sessions with the area's default energy type. Story points, links and comments are kept as custom fields or in the description. It refuses to run if any key already exists.

---

## 13. The Android app and sync

### 13.1 The app

- **Version.** Reskon has one version number (`major.minor.patch`, in the `VERSION` file). The web app shows it on the sign-in page and in Settings › About, the phone in Settings › About (and, when connected, the server's version, read from the server's health check), and the server in `GET /api/health`. See the README.
- A Kotlin and Jetpack Compose app (Material 3, the web app's dark colours) in `mobile/android`. It is called **Reskon** on the phone (app id `com.aakash.reskon`). The release APK is signed with the Reskon key kept outside the repo and built, checked and copied to the Linux machine by `mobile/release.ps1` (why: `docs/decisions.md`).
- **It works fully on its own.** It runs Reskon's own Go code inside the app (built as a library, `mobile/jbcore`), with its own database file on the phone. Every screen reads and writes through it, so everything works offline and every number is worked out by the same code as the server.
- Screens: Today (plan and readout, only while the Day screen is switched on; the app opens on Board otherwise), Log session, Quick capture, Sessions, Inbox, Board / List / Timeline, Task, New task, Search, Buffs and debuffs, Dashboards, Cycle time, More, and Settings (everything in section 12, plus Sync server and Download database; Settings › Screens has the Day screen switch).
- **Snoozed and blocked tasks on the phone work as on the web.** A snoozed task is not in the Board, List or Timeline until it wakes. A blocked task is left out too while the view hides blocked tasks (the default, and the view's own choice, shared with the web). Views that never made that choice now hide blocked tasks too, so after updating, blocked tasks leave the phone's lists and sit under **Blocked**. A done task that still has an open blocker counts as blocked as well, as on the web.
- **Snoozed, Blocked and Incomplete are three joined buttons** under the header, each shown only when it has tasks, with its count (the counts follow the current search). Each opens a list; tap a task to open it. **Snoozed** lists tasks with the day each comes back (or what it waits for), those waiting on a blocker first, and a **Wake now** button. **Blocked** says what each is waiting on and has the "hide them from this view" switch. **Incomplete** says what each lacks, once Settings › Complete details asks for something. A list closes by itself when its last task leaves. The buttons stay big enough to tap at any text size by scrolling sideways.
- **A new day wakes snoozed tasks on the phone.** Snoozes are worked out from the date, so the phone reloads its lists when the date changes while the app is open.
- **The phone's own account.** The built-in Go code needs an account, so the phone has one called "me" with a hidden password nobody types. Connecting a sync server copies the phone's data into your server account.
- **Download database** saves a clean copy of everything as one SQLite file, for moving data without a server or for a backup.
- **Nothing goes into Google's backup or a phone-to-phone transfer.** The app's database holds all of a person's data and its settings hold the sync sign-in, so Android is told to leave them out. To move to a new phone, use Download database or sync with the server.
- **Other apps and web pages cannot open the app's screens.** The `jitterbug://` links used for testing over adb still work from adb, but a web page can no longer launch them, and turning the phone does not open the same screen again.
- **Disconnecting during a sync sticks.** If you disconnect (or connect to another server) while a sync or check is running, its result is thrown away instead of bringing the old connection back.
- The phone tells the server its time zone (see section 14).

### 13.2 Sync: how the phone and the server stay the same

Phones only ever sync through a server, never with each other.

- **First start**: the app asks "Do you have a Reskon server?". **Connect to a server** signs in and downloads everything first. **Offline** asks for the first area, as the web app does, and a server can be added later in Settings. If the server has no areas yet, the phone asks for the first one after the download.
- **The first download**: right after connecting, whether at first start or later from Settings, everything on the server is downloaded and the phone's own data is sent up. The app shows how far it got (sending, then downloading as a percentage, then saving) and nothing else can be used until it finishes. If it fails, you can **Try again** or **Disconnect**, and the phone's data stays. If the app is closed midway, nothing of the download is kept, and the next start begins it again.
- **When it syncs after that**: on opening the app, a few seconds after a change, every 5 minutes, and from **Sync now**. A failed sync just waits for the next one. Nothing on the phone waits for it.
- **Errors say where they happened**: "This phone's data: …", "Can't reach the server: …" or "Server answered …".
- **Each record has an ID every device agrees on** (a uid). Built-in records (the seeded statuses, energy types, priorities, dashboards…) have the same uid everywhere, so every device's "Backlog" is one record.
- **What is sent**: for each record, its values plus, for each field, when it last changed and on which device.
- **Conflicts are settled field by field: the latest change wins.** If the phone renames a task and the web changes its priority, both are kept. If both rename it, the later one wins. "Later" uses a clock that never goes backwards, so a phone with a wrong clock can't win forever. On an exact tie, every device picks the same winner. For data from before sync existed, where nobody knows when it last changed, the server's value wins.
- **A delete wins.** An old copy can't bring a deleted record back.
- **Status follows moves.** Moves (transition log rows) from every device are all kept, and a move that is already on a device is never changed or deleted by another device's sync. A task's status is the one its latest move went to.
- **Sessions** travel with their energy-type parts and subtypes as one record.
- **Task keys can clash**: two devices offline can both make `PR-2`. The server keeps the first and gives the second the next free number. That change is sent back.
- **A new device** gets a full copy first, then only changes.
- **Disconnecting** keeps everything on the phone. It can connect to the same or another server later; the two sides are merged.
- **Not synced yet**: view background images, and the capture API key (it should sync encrypted with a key made from your password; not built).

---

## 14. Time zone, offline web and dates

- **Each person has their own time zone.** The browser and the phone send theirs when they open (the `time_zone` setting), and the server uses it for "today": due dates, snoozes, states and charts. Until one is sent, the server's own zone is used.
- Dates you pick (logged for, due, start, end) are plain calendar days. Times (created, moved, changed) are stored in UTC.
- **A new day reloads everything.** The web app checks the date every 30 seconds and when you come back to the tab, and reloads its data (not the page) when it changes, so snoozes wake and the day screen moves on.
- **The web app needs the server.** When the connection drops, what is on screen stays, read only, with a banner. Buttons are greyed out with an explanation, not hidden. On reconnect everything reloads. Nothing is queued while offline. (The phone is the offline app.)
- **When a screen can't load, it says so.** A board, table or session list that fails to load while the server is reachable (an error from the server, not a dropped connection) shows what went wrong with a **Retry** button. If older data is already on screen it stays, under a warning that it may be out of date. A slow answer for a view, range or filter you have already left never replaces what you are looking at.

---

## 15. How the data is stored

### 15.1 Files

- `<data>/auth.db`: accounts and sign-in sessions.
- `<data>/users/<name>-<id>.db`: one database per person, all with the same tables.
- `<data>/models/`: the duplicate search model, shared by everyone, if downloaded.
- On the phone: the same kind of database in the app's private storage.

The database is SQLite in WAL mode (several readers, one writer). There is one connection per file, so writes happen one at a time.

### 15.2 Tables in each person's database

| Table | What it holds |
| --- | --- |
| `status_category` | The four behaviours a status can have. |
| `status` | Your statuses: colour, position, behaviour, hidden from board or not, alert after days. |
| `priority` | Your priorities: colour, weight. |
| `energy_type` | Your energy types: colour, points per hour. (An old `direction` column is no longer read.) |
| `subtype` | Subtypes, each under one energy type. |
| `area` | Areas: name, key prefix, colour, default energy type. |
| `task` | Tasks, epics and subtasks: key, title, description, area, status, priority, energy type, level, estimate, due, start and end dates, snooze, epic, parent, board position, custom fields. |
| `status_transition` | The move log. Only ever added to. |
| `task_link` | "Blocked by" links. |
| `session` | Logged time: hours, date, start time, description, task, area, task/event, energy type, level, points, note, custom fields, last changed. |
| `session_energy` | The parts of a session with several energy types: share, level, points. |
| `session_subtype` | A session's ranked subtypes. |
| `day_plan` | Each day's focus, ceilings and evening answers. |
| `state` | Buffs, debuffs and modifiers. |
| `inbox_item` | Inbox lines. |
| `view` | Saved views: filter, layout, card settings, board settings (grouping, sorting, column limits, collapsed columns, timeline), icon, colour, background. |
| `image` | Uploaded background images. |
| `dashboard`, `widget` | Dashboards and their widgets: the metric question, the chart type, position. |
| `custom_field` | Custom field definitions. |
| `setting` | Your settings, each a JSON value: subtype weights, capture model, week start, task dates, snooze, complete details, card actions, epic columns, time zone, theme… |
| `task_embedding` | A cache for duplicate search (can be emptied, nothing is lost). |
| `sync_meta`, `sync_idmap`, `sync_field` | Sync: this database's device id and clocks, each record's uid, and when each field last changed. Only the latest change per field is kept, so it never grows beyond the data. Small database rules (triggers), made by the Go code from one table list on every start, fill these in. |

### 15.3 Rules for the database

- **Migrations only add.** Once a database exists, a new version may add tables, columns or rows, and may fill them in, but never removes or rebuilds anything. The version applied is kept in SQLite's own header (`user_version`).
- Times are UTC text with a fixed width, so sorting text sorts by time.
- Most deletes only set `deleted_at`, so history still points at real rows.
- Values worked out from others are never stored, with one exception: a session's points (section 6.3).
- Migrations so far: 001 the first tables; 002 epics and board settings; 003 intensity becomes 1–5; 004 view icons, colours and backgrounds; 005 dashboards and stored points; 006 all energy types equal; 007 pies and shares; 008 retire "Energy drain felt"; 009 several energy types per session; 010 start and end dates; 011 snooze; 012 duplicate search cache; 013 subtasks; 014 dependencies; 015 inbox; 016 sync; 017 session "last changed", start dates filled in, unfinished parts hidden.

---

## 16. The API

JSON over HTTP. Every `/api` call except health and sign-in needs the session cookie. Errors are `{error, detail}` with real HTTP codes; a conflict (409) also carries the current record.

| Path | What it does |
| --- | --- |
| `GET /api/health` | Is the server there. |
| `/api/auth/status`, `setup`, `login`, `logout`, `password` | Signing in. `/api/users` for admins. |
| `GET /api/bootstrap` | Everything the screens need at start: areas, statuses, priorities, energy types, subtypes, views, custom fields, settings. |
| `GET /api/tasks?view=:id` | A view's tasks (filter runs on the server). Also `?brief=1` (short list for pickers), `?type=epic`, `?epic=:id`, `?parent=:id`, `&q=` (search). |
| `GET POST /api/tasks`, `GET PATCH DELETE /api/tasks/:id` | Tasks. PATCH sends only the fields that change (missing = untouched, null = clear) and the "last changed" it saw. DELETE takes `?subtasks=delete`. |
| `POST /api/tasks/:id/move`, `POST /api/tasks/move` | Move one task (`status_id`, `before_id`, `after_id`), or many. |
| `POST /api/tasks/:id/snooze` | Snooze or wake. |
| `GET /api/tasks/:id/transitions`, `GET /api/cycle-time?view=:id` | Move history and cycle time. |
| `GET /api/tasks/similar?q=` | Duplicate search. `/api/semantic` for the meaning model. |
| `POST /api/task-links`, `DELETE /api/task-links/:id` | Dependencies. |
| `GET POST /api/sessions`, `PATCH DELETE /api/sessions/:id`, `POST /api/sessions/bulk` | Sessions. |
| `POST /api/capture` | Reads a line. **Never saves anything.** |
| `/api/inbox` | Inbox lines, triage, discard. |
| `GET PATCH /api/day/:date` | The day's plan, readout and totals. |
| `GET /api/metrics`, `GET /api/metrics/catalog` | Chart data (by query, or `?widget=:id`), and what each metric allows. |
| `/api/dashboards`, `/api/widgets`, `PATCH /api/dashboards/:id/layout` | Dashboards. |
| `/api/states`, `GET /api/states/shapes` | Buffs and debuffs. |
| `/api/areas`, `/api/statuses`, `/api/status-categories`, `/api/priorities`, `/api/energy-types`, `/api/subtypes`, `/api/custom-fields`, `/api/views` | Your lists. DELETE takes `?reassign_to=:id` (and `?clear=true` for priorities). |
| `PUT /api/settings/:key` | Save a setting. |
| `POST /api/tasks/delete` | Delete up to 1000 tasks at once (`task_ids`; `subtasks: "delete"` takes their subtasks too). All or nothing. |
| `POST /api/images`, `GET /api/images/:id` | Background images. |
| `POST /api/sync` | Sync: a device sends its changes and gets back what it hasn't seen. The `X-Sync-Size` header gives the answer's size before compression, for the phone's progress bar. |
| `POST /api/sync/outgoing`, `POST /api/sync/incoming` | Used by the phone's built-in core: get the request to send, apply the answer. |

---

## 17. Hidden now, planned next

| Item | State |
| --- | --- |
| **Stuck** view and **Stuck work** widget | Hidden until designed. |
| **Drift** ("day 7 of a 2-day break") | Hidden, with its settings, until designed. The code stays. |
| Keyboard shortcuts | Next phase. |
| Day label (rest / normal / heavy day) | Waits for enough data to set thresholds. |
| Timer | Its own plan; it will share sessions. |
| Symptom log, and linking symptoms to debuffs | Separate, undecided. |
| Timeline connectors and editing | Phase 3. |
| Capture saved offline in the web app | Phase 3 (the phone already works offline). |
| Syncing the capture API key (encrypted) and background images | Not built. |

---

## 18. Building and checking

- Go (standard library HTTP, `modernc.org/sqlite`, pure Go, no C compiler). React 18 + TypeScript + Vite, Ant Design 5, dnd-kit, react-grid-layout, Recharts. The built web app is embedded in the Go program, so it is one file.
- `make build`, `make test` (Go checks, Go tests, TypeScript check). The phone: `mobile/build.ps1` builds the Go library; `mobile/android` is a normal Gradle project.
- Tests focus on the maths and the rules, not the screens: key numbering, dates from the log, card ordering, points, status deletion, custom field checks, decay curves, every metric against hand-written SQL, day boundaries in local time, week starts, sync between two databases.
- A step is done when its check was actually run, tests pass, this file is updated, and the app starts from an empty database and an existing one, both bare and in a container.
