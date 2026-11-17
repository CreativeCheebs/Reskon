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
- **Default priority** (Settings › Workflow › Default priority): the priority a new task gets when it is created without one, or **None**. It applies everywhere a task is created (board, task panel, quick capture, subtasks, the phone, the API), because the server applies it. It starts as Normal. A task created with a priority of its own keeps it, and quick capture's priority box starts on the default and can be cleared to None. If the chosen priority is later deleted, new tasks get none. Existing tasks are never changed.
- **Level** is 1 to 5, shown as 1 to 5 slanted lines (one line for level 1, five for level 5) in a colour that goes from pale to deep blue. There is no red: a restful level 5 is not a warning. The number is written beside it, so nothing depends on the colour.
- A task's own points (shown on the task) are **level × priority weight**. No level means no points. No priority counts as 1.

### 4.9 Epics

- An epic is a task of type *epic*. Ordinary tasks can belong to one epic. An epic can't belong to an epic.
- **Create an epic from the task panel.** In the task panel's epic picker, typing a title that no epic already has (ignoring capitals) adds a **Create epic “<text>”** choice to the list. Choosing it (Enter works) makes a new epic with that title, in the same area as the task, and puts the task in it. Like any task made anywhere, the new epic also gets the default priority (see Default priority). A second click while it is being made does nothing; if the epic was made but could not be added to the task, a message says so. The choice does not appear for empty text or when an epic with exactly that title exists.
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

- Snoozing hides an open task for some days without changing its status. Only *to do* and *in progress* tasks can be snoozed (Backlog included). The longest snooze is a setting (default 60 days, 1–365; it saves when you leave the box or press Enter, not on every key). The snooze menu (on the task panel, the card's Snooze button and the right-click menu) offers a list of ready-made intervals and a date picker for any other day up to the longest snooze. Settings › Snooze lets you add, remove and reorder the intervals (up to 16, each 1–365 days; an interval longer than the longest snooze stays in the list, greyed, but the snooze menu does not offer it, so lowering the longest snooze never leaves a choice that would be refused; default: Tomorrow, 2 days, 3 days, 1 week, 2 weeks, 1 month; the first is always called "Tomorrow", never "1 day"). Snoozing works in whole days, so there is no "later today". Both settings are kept in your account, not in the browser.
- Snoozed tasks are listed under a **Snoozed** button with the day each comes back, and a **Wake now**.
- A task can also be snoozed **until its blockers are done**.
- **The snooze menu shows what is already coming back.** It has a small header (*Snooze until*, *Hours*, *Points*), then one row for each of your snooze intervals (Settings › Snooze: *Tomorrow*, *3 days*, *1 week* and so on, in your order) showing its name with its date under it in small grey text, then two numbers on the right. **Hours** is the summed estimates of the snoozed tasks that wake on that exact day, and **Points** is what those estimates would earn. A dash means nothing comes back that day. Example: *Wed 18 Nov — 3h — 7* means two tasks wake that day with estimates adding to 3 hours, worth 7 points. A task with no estimate adds nothing; done, cancelled and deleted tasks are not counted; the task you are snoozing is not counted. A task's points are its estimate in hours × its energy type's points per hour × its priority weight × its level (difficulty); anything missing counts as 1. Energy types are only added together, never set against each other. The days are your own days (the date you see, in your time zone). The same menu opens from the task panel, the hover button on a card and the card's right-click menu. In the task panel, the date picker says what comes back on a date you have picked, before you press OK (for example *Mon 7 Dec: 2h, 5 pts*), and so does the days box for the days you typed. The numbers are asked of the server each time the menu opens; while they load, or if that fails, the menu shows without numbers and snoozing still works.
- Waking is worked out from the date, so nothing runs on a timer. Moving a task to *done* or *cancelled* clears its snooze.

### 4.13 Complete details

Settings › Complete details lets you choose fields an open task should have (start date, end date, due date, estimate, level, priority, energy type, description, epic). An open task of type *task* missing one of them is **incomplete**: views show an **Incomplete** button listing them with what each lacks, and the task panel says what's missing. Done and cancelled tasks, epics and snoozed tasks are never listed. With nothing chosen, there is no Incomplete button.

### 4.14 Deleting a task

Deleting a task hides it (its key stays used). Its sessions stay, without a task. A deleted task blocks nothing. Deleting an epic does not delete the tasks in it: they stay, just no longer in that epic. Deleting one task asks yes or no (a task with subtasks also asks whether they go too). Deleting **several at once** from the table has no undo, so the box lists what goes and asks for the word *delete* to be typed out by hand (pasting is blocked). All of them are deleted or none (`POST /api/tasks/delete`); subtasks stay as ordinary tasks unless the box is ticked.

### 4.15 Tags

A **tag** is a short free word on a task ("backend", "q4"), beside its area and epic. A task can have several (up to 20).

- A tag name is 1 to 32 characters, with no commas or hidden characters. A leading `#` and extra spaces are dropped. "Backend" and "backend" are the same tag (case is ignored for the letters a to z only: "Éa" and "éa" count as two tags). Settings › Tags lists them with how many tasks and sessions have each; a tag can be renamed (everywhere at once) or deleted (taken off everything).
- Saving a task with `tags: null` or an empty list removes all its tags; leaving `tags` out keeps them.
- Naming a tag that does not exist yet creates it, so tags are made by using them: in the task panel, in the new-task form, in the session form, or in quick capture.
- **Sessions.** A session shows the tags of its task **as they are now**, and its own tags. The task's tags are never copied: change a task's tags and every session of it changes at once, on every device. A tag put on a session by hand belongs to that session and stays when the task's tags change. A session with no task has only its own tags, so they are chosen by hand; detaching a session from its task drops the tags it had from the task. The session shows which tags come from the task (they follow it) and which are its own.
- **Filters.** A view can filter by tags (any of the chosen ones, or "no tags"); the Sessions screen filters the same way, by the task's tags and the session's own. Filtering is done on the server. Cards and tables can show a task's tags (Card settings).
- **Quick capture** can pick tags, but only from the tags that already exist: it never invents one. A word typed with a `#` in the line ("fix login #backend") is taken as that tag when it exists, with or without the model. The confirm form shows the tags for each entry, to change before saving.
- Tags sync like everything else. The same tag made on two devices is one tag, and the same tag put on the same task on two is one link.

### 4.16 Editing at the same time in two places

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
- The task picker ends with **Create new task** (on the web: in the Log time and Edit session forms and in each entry of quick capture; on the phone: in the session form's task picker). It asks only for a title (starting with what was typed in the picker's search box) and an area (the session's, else the first), makes the task in the first to-do status, and picks it for the session. Everything else on the new task can be filled in later on the task. It is not offered when the picker is only filtering (the Sessions screen's task filter).
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
- **Copy as Markdown.** Each day shown has a **Copy as Markdown** button that copies that whole day's sessions, ready to paste into a journal (it ignores the filters, like the day totals do). Example:

  ```
  ## Sunday 15 November 2026 — 6h 30m, 42 points
  - 09:00–10:30 · Fix backup script (Home) — 1h 30m
    Found the cron path was wrong; fixed and tested.
  - Reading (Learning) — 45m
  ```

  The heading has the day's hours and points. Each session is a line: its times (start to start plus hours, in your time zone) only if it has a start time that belongs to the day (the same date, or the day before), then the task's title (never the task key) or, with no task, its own description, then the area in brackets and the hours. The session's note goes under it, every line indented two spaces, so a note of several lines stays readable Markdown. What you type never changes the Markdown around it: a name that starts like Markdown (`#`, `>`, `-`, `1.` and so on) gets a backslash in front, a note line made only of dashes or equals signs gets one too (it would turn the line above into a heading), and a line that another follows ends with two spaces (so programs that ignore single line breaks keep each line on its own). Sessions with a start time come first in time order, then the others in the order they were logged. The text and the totals are made by the server, not added up in the browser. After the copy the screen says **Copied**. If the browser will not let a page copy (browsers only allow it on https or localhost, and Reskon is often opened over plain http) Reskon tries the older copy command, and if that fails too it opens a box with the text already selected, to copy by hand. The same text is what the journal widget (10.1) offers. The text is fetched when the days load (once for the dates shown, not again for each filter or search keystroke), and again after a change; if it is not there yet, or could not be fetched, the click asks the server for that day first, so the text copied is never an old one, and says so if it still cannot get it.
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
- States in force show as chips along the top of every screen, except a dashboard, which has no such bar: add a **Buffs and debuffs** widget there instead (10.1).
- **A state never changes any number.** It sits beside the numbers and explains them.

---

## 10. Dashboards and charts

### 10.1 How it works

- A dashboard is a page of widgets on a grid (12 columns). Edit mode is a switch, so nothing moves by accident while you read. In edit mode, drag and resize; the layout saves when you drop.
- Every widget is **a source plus a way to draw it**. The source says where its content comes from: a question to the metrics API, a connected app's data (numbers, lists, tables and checklists, drawn by Reskon's own chart types), a connected app's own small page (12.4), a saved view's open tasks, drawn as a small board (below), your session notes day by day as a journal (below), or the buffs and debuffs in force (below). No widget has its own special code. Adding something new to measure is one entry in the metric list; adding a new chart type is one entry in the list of chart types. A widget of a source this version does not know (made by a newer Reskon) says it needs a newer version instead of showing anything.
- Each widget loads when shown and has a refresh button. No background polling: a widget reloads when your data changes (see 14, live updates), keeping what it shows until the new answer arrives. An app's page is the exception: it loads when shown and on Refresh only, since Reskon's data means nothing to it. A widget of a source this version does not know has no Refresh or Edit button; it can still be moved and removed.
- **A board on a dashboard.** In edit mode, **Add widget › Board** picks one of your views, and the widget shows that view's open tasks as a small board: the view's own board columns that are to do or in progress, in the view's order, each with its name and a count of its tasks. Done and cancelled columns are not shown, and a column kept off the board (such as Backlog) is not either. Which statuses count as open comes from each status's category (to do, in progress, done, cancelled), never from the status's name. The view's filter decides which tasks appear: the widget saves only the view's id, and the server works the filter out, exactly as for the board itself (a change to the view's filter changes the widget). Snoozed tasks are left out, and so are blocked ones unless the view shows them, the same as on the view's own board. Cards are small: the title, then priority, level and due date (an overdue one always says so), in the view's card order (manual, or its chosen sort); never the task key. Each column shows at most 20 cards, then **+N more**, which opens the view. An **Open view** icon button in the widget's top row does the same. In the dashboard's edit mode both are switched off (the widget is for dragging then). Clicking a card opens the task panel; Enter or Space does too. The cards are the board's own cards with the board's own quick actions: hovering a card shows its buttons and right-clicking it opens its menu, exactly as chosen in Settings › Card actions (Log time, Snooze, Note, Move to, Open task, Delete), and each does what it does on the board (Delete asks first). After one, the widget reloads, so a task moved elsewhere leaves its column or the widget as the view's filter says. Cards do not drag between columns here: a status is changed with Move to, or on the board itself. While the dashboard's layout is being edited the buttons and the right-click menu are switched off as well (the browser's own menu shows instead). The title starts as the view's name, and the widget starts wide (8 of 12 columns, 7 rows high). It reloads when your tasks change (see 14, live updates) and keeps its cards on screen while it does; if a reload fails the cards stay, with a small "Could not refresh" note and a Retry button under them. It always shows the view's tasks as they are now: the dashboard's Day and Dates choice does not change it. If the view was deleted, the widget says so and its Edit button lets you pick another. The phone shows it as "Shown in the web app".
- **A journal on a dashboard.** **Add widget › Journal** (with a range: Today, Yesterday, 7 days, 30 days or This month; it starts at 7 days) lists what you did each day, newest day first: for each day its date with its hours and points, then each of its sessions with its times (only when it has them), what it was (the task's title, else the session's description), the area, the hours, and the session's note underneath, line breaks kept, shown as plain text. It is how a day reads as a journal: write a few lines in the session notes about what you were really doing. Days with no sessions are left out. Every session of the day is listed, whatever the other widgets show. Each day has the same **Copy as Markdown** button as the Sessions screen (6.4), and a session on a task opens the task panel when clicked (not while the layout is being edited). Hours and points come from the server. It lists at most the newest 62 days with sessions and says so when it cut older ones off, telling you to move the dashboard's dates earlier to see them (a wide Dates choice can span a year). Each day is a heading with its date (and the year when the days are not all in this year). It reloads when your data changes, keeping the days on screen while it does; if a reload fails the days stay, with a small "Could not refresh" note and Retry. The dashboard's Day and Dates choice replaces its range, with the "showing <dates>" note under it. The phone shows it as "Shown in the web app". Home and the other seeded dashboards do not include one; add it yourself.
- **Buffs and debuffs on a dashboard.** **Add widget › Buffs and debuffs** shows the states in force right now, worst first, as the same chips the other screens show along their top; states not in force are left out, and it says "Nothing in force." when there are none. It saves nothing but its title (it starts as "Buffs and debuffs", 12 columns wide and 3 rows high), and follows every change to a state by itself. A chip opens the Buffs and debuffs screen (not while the layout is being edited). The phone shows it as "Shown in the web app". Home has one at the top, put there for everyone; the other seeded dashboards do not include one, add it yourself.
- **No big title, and the toolbar's place.** A dashboard shows no page title and no buffs bar above it, so the widgets get the room: the dashboard's name is the chosen tab in its toolbar. **Settings › Screens › Dashboard toolbar position** is **Top** (the default: one row of tabs, dates and Edit across the top) or **Left** (the same controls in a column down the left side, the widgets to its right). It is one account setting (`dashboard_toolbar`, "top" or "left"), web only; a narrow window always uses the top.
- A dashboard can run every widget over one chosen day or a span of dates instead of each widget's own range. That choice isn't saved. In Day, **Today** and **Yesterday** buttons jump to those days. While the choice is on, each widget it changes says which dates it is showing in a small note under it ("showing 14 Nov", "showing 1–7 Nov", "showing 28 Oct – 3 Nov"; the year is added when it is not this year's), so a title such as "Hours yesterday" never claims a day it is not on. A widget that ignores the choice shows no note: a board, an app's page, an app's data with no range, and a measure that is a current state rather than a span of days (such as how long open tasks have sat in their status).
- On a narrow screen (under 768px), widgets stack in one column in saved order, with no editing. A chart too narrow to read shows as a single number instead. The Android app shows dashboards this way.

### 10.2 Chart types

Bar, line, bars and a line (two measures on two scales, only for points and hours), cumulative (only rises), number, list, bands (states across days, drawn as spans), split bar (stacked), share bar (each day stacked to 100%), pie, table, and small multiples (one small chart per energy type, each with its own scale, never added together).

For a journal widget only: **journal**, the days' sessions with their notes (see 10.1). Like the board it is not a chart of a measure.

For a view widget only: **board**, the view's open tasks in columns (see 10.1). It is not a chart of a measure, so no metric can be drawn as one.

For a connected app's data only: **checklist**, each item with a ticked or empty box, its label and its detail, and the words "done" or "not done" for screen readers. It is read-only: nothing in it can be clicked; ticking happens in the app's own page.

Which chart types suit an app's data depends on its shape: a number as a number; a series as bars, line, cumulative or a number (stacked bars when it has parts); a table as a table (with the app's own columns); a list as a list; a checklist as a checklist.

### 10.2a Chart settings in the widget editor

A chart widget (bars, line, cumulative, stacked, share bars, small multiples) has these settings, all saved with the widget:

- **Period.** Besides Today, Yesterday, 7 days, 30 days, 90 days, This month, Year and All, **Custom dates…** lets you pick any first and last day (a calendar range picker, starting on the last seven days). The widget then keeps those two dates instead of a range, so it always shows exactly that period. The dashboard's own Day and Dates choice (above) still replaces it while it is on. The first date may not be after the last, the two may be at most 3,660 days (about ten years) apart, and the years must be 1970 to 2100; the server refuses anything else when the widget is saved or asked. The phone shows such a widget over the same dates.
- **Colours.** A chart with one series has one **Colour**, picked with the same colour picker used everywhere (a free picker and the standard swatch sets). A chart with several series (split by energy type, area or subtype, or a combined chart) has a colour for each series, with a clear button to go back to that series' own colour (an area's or energy type's colour). Colours are saved with the widget (on the server, so every device shows them) and apply to bars, lines, stacked and share bars, small multiples and pies. A colour must be `#rrggbb`; the older palette names saved by earlier versions still work. The phone ignores them and draws with its own colours; it also ignores any chart setting it does not know, so a widget set up on a newer web app still shows there.
- **Show each value.** A switch writes each bar's value above it, and each line point's value above the point, in the measure's unit (for example `7.5h` or `12`). On stacked bars the value of each part is written inside its part (parts of zero show none). It is only a label for numbers the server already gave; nothing is added up on screen. Off by default.
- **Show the average.** A switch draws the average as a dashed line across bars, lines and stacked bars, labelled "avg" with its value. The server works it out and sends it with the answer (`average`): the mean of the chart's figures, one per day, week, month or group value (all types of a stacked bar added up), with days that have nothing counting as zero. For example, 30 days with 60 hours logged in all average 2h a day. A line chart split into several series gets one dashed line per series, in that series' colour, each its own mean. It is never one type divided by another, and a running total (cumulative) has no average, so the switch is not offered there. Off by default.
- **Points and hours in one chart.** The measure **Points and hours** is drawn only as **Bars and a line**: points as bars on the left scale, hours as a line on the right scale, each axis in its own colour and unit, with a legend. It takes the same filters as the session measures (area, energy type, subtype, task or event, task, tag) and can be grouped by day, week, month, area or energy type, but not split. The two series are only shown side by side: they are never added together, subtracted or divided (no points-per-hour), so this measure has no single total, and a chart too narrow to read shows each one's own figure instead of one number. Each series keeps its own colour setting, value labels and average line. The phone shows such a widget as "Shown in the web app".

### 10.3 Metrics

| Metric | What it measures |
| --- | --- |
| Session hours | Hours logged. |
| Points | Points stored on sessions. |
| Points and hours | Both at once, as two series for the bars-and-a-line chart (10.2a). |
| Sessions | How many sessions. |
| Tasks closed | Tasks moved into done, by the day they were completed. |
| Open tasks | Tasks open now. |
| Time in status | How long open tasks have sat in their status. |
| Cycle time | Hours tasks spent in each open status. |
| State days | Buffs and debuffs across days. |
| Days over plan | Days where any type went over its ceiling. |
| Ceiling vs actual | Hours as a share of the planned ceiling, per type. |

- Each metric says which groupings (day, week, month, area, subtype, energy type, status, task, session…) and filters (area, energy type, subtype, status, task/event, task, tag) it allows. The session metrics' tag filter means what it means on the Sessions list: the task's tags or the session's own, and "no tags" for none. The widget editor only offers what the server supports.
- Ranges: today, yesterday, 7 days, 30 days, 90 days, this month, 1 year, all, or chosen dates. **Yesterday** is the day before your today, worked out in your own time zone as Today is: at 00:30 on the 16th in India, yesterday is the 15th (UTC is still on the 15th then, and does not matter). A day with no sessions is not an error: a number widget shows 0 and a chart says "no data".
- Weeks start on the day set in Settings › Reflection (default Monday).
- Totals, running totals and shares come from the server, never added up on screen. A share is a part of the sum of all types, never one type divided by another.
- By subtype, hours and points carry the subtype's rank weight.
- Epics are left out of task metrics. Snoozed tasks are left out of time in status.
- An empty range returns no points and the widget shows "no data", not an error.

### 10.4 Seeded dashboards

**Home**, **Today**, **This month** and **The year**, all editable and deletable, with charts of hours, points and shares by energy type, conditions, counts and days over plan. Drift and Stuck work are hidden for now.

**Home** is listed first and is the one shown when you open Dashboards. It answers "what am I doing, and what do I need to do?":

- **Open tasks**, a small board (10.1) on the left, wide and tall. It shows the first of your views that has a board layout (the one nearest the top of your sidebar); if you have no board view yet it shows your first view of any kind (a new account has only the table view Everything until its first area makes a board view). With no views at all the board is left out. Not chosen by name; use **Edit** on the widget to show another view.
- **Hours yesterday** and **Points yesterday**, two numbers stacked on the right.
- **Points, last 7 days** and **Hours, last 7 days**, a bar for each day, side by side along the bottom.
- **Buffs and debuffs**, a small strip across the very top (full width, 2 rows high), showing the states in force (the widget described under "Buffs and debuffs on a dashboard"). Everything else on Home sits two rows lower than it used to. Everyone has it: new accounts, and existing accounts (an upgrade adds it once to the Home that came with the app). A Home that already has a Buffs and debuffs widget, or that you deleted, is left alone; a Home you renamed still gets it. If you delete the widget it does not come back.

Everyone gets Home, new accounts and existing ones (an upgrade adds it once). Your other dashboards are not moved or changed. If you already have a dashboard called Home you then have two; rename or delete either. Home is an ordinary dashboard after that: edit, rearrange or delete it.

### 10.5 Why not Grafana

See decisions. In short: it would be a second program to run, embedding it securely is fiddly, and it is built for alerts and thresholds, which this app avoids.

---

## 11. Search

- **Duplicate search** runs as you type a task title (in a column's add box, in quick capture, in a view's search) and lists tasks that look the same. It matches by words (word stems, the word still being typed, one typo) in titles **and descriptions** (a description match ranks just below the same title match). With the small meaning model downloaded, it also matches by meaning ("stomach acid" finds "heartburn diagnosis"). Matching by meaning reads titles only.
- The meaning model (all-MiniLM-L6-v2, about 90 MB) runs inside Reskon, offline. An admin downloads it once in Settings › Duplicate search. Without it, word matching works alone. The phone has word matching only.
- **Global search**: press `/` or open Search. It uses duplicate search plus exact task keys (typing `JB-42` opens that task).

---

## 12. Settings

A **search box** at the top of Settings finds a setting by its name or by any word in its one-line description (every word you type must match; capitals do not matter). While you type, the menu keeps only the sections with a match and the page lists the matching settings, each with its description and the section it is in; choosing one opens that section. Clearing the box (or Escape) brings the normal view back. Every setting has a name and a description in one list (`web/src/admin/settingsIndex.ts`); a test fails if a section has none.

Every setting is kept in your account on the server, so it follows you to other devices. The only things kept in the browser are small conveniences that suit one screen: the last colour-picker tab, how wide you dragged a table column, whether the sidebar is folded, and the last area you picked when adding a task.

| Group | What you set |
| --- | --- |
| Workflow | Areas (name, key prefix, colour, default energy type), statuses, priorities, default priority, task dates, snooze, complete details, card actions, custom fields |
| Time and points | Energy types (name, colour, points per hour), subtypes, subtype rank weights, reflection (week start) |
| Connections | Apps (connected apps, see 12.4), quick capture model, duplicate search model, sync server (phone) |
| Data | Download database (phone) |
| You | Screens (the Day screen switch and the Dashboard toolbar position), Names (what tasks and epics are called), About (the version), Appearance (themes: **System** (the default), Light, Dark, Jira, Jira high contrast, GitHub Dark, GitHub Dark Dimmed; **System** shows Light or Dark to match your computer's light or dark setting and switches by itself when that setting changes, for example at sunset, with no refresh; Light and Dark stay as chosen; your choice is saved on your account (setting `theme`, `{"id": "system"}`), so it follows you to another browser, and a person who already chose a theme keeps it; Dark (the old Default, same id) uses warm charcoal surfaces and periwinkle accents, and Light is warm paper with the same periwinkle; a connected app's page (12.4) is sent the new colours at once, with `mode` "light" or "dark"; web controls have roomier targets, cards separate progress from labels, and board columns use quiet outlines with coloured status dots; download one as a file, edit it, upload it; in any theme, grey secondary text is lightened just enough to be readable, at least 4.5:1 on every surface), account |
| Admin | People |

The web app serves its reading font with the app, so it works without an outside font service. Toolbars group related controls; task details sit in a labelled panel. Dashboards have no title of their own: the dashboard's name is its chosen tab on the toolbar. Empty chart widgets explain that another date range may have records, and a failed widget offers Retry. Keyboard focus has a visible outline.

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

### 12.4 Connected apps (plugins)

Other apps you run can show on your dashboards: a habit tracker now, a food log later. Task management stays in Reskon; other things come from apps. How to make an app work with Reskon is in `docs/plugins.md`; why it works this way is in `docs/decisions.md` ("Plugins (connected apps) and live updates").

- **Settings › Apps** connects an app by its address, for example `http://192.168.0.8:5000`. **Look up** reads the app's description file (`/.well-known/reskon-app.json`) and shows its name and the widgets it offers, before anything is saved.
- **Sign in once.** The app says how: no sign-in, a token you paste, or a username and password. A password is used once to get a token from the app and is not kept. Reskon keeps the token on its server: it is never sent to the browser and never synced to the phone.
- Each app shows whether Reskon could reach it (**Connected**, **Can't reach it**, **Problem**), with the reason and when it was last checked. **Check again** reads the description again (a new name or new widgets show up). **Sign in again** is for a password changed in the app. **Remove** forgets the app and its sign-in; the app and its own data are not touched.
- An app's addresses must all be under the address you connected (same machine and port, inside its path); Reskon refuses one that points elsewhere. The description file must be readable without signing in. Reskon follows no redirects, gives an app 5 seconds and 1 MB per answer, and never shows what an app answered on an error, only its status (for example "answered HTTP 500").
- Anyone signed in can connect apps, and each person's apps are their own.
- **Apps in the sidebar.** The left sidebar has an **Apps** heading with one row per connected app, shown only when at least one is connected. A row shows the app's name and icon and opens the app's own page (its `home_url`, worked out by the server from the app's address) in a new browser tab. An app that cannot be reached stays in the list and still opens, with a warning icon, quieter text and the reason in its tooltip ("can't be reached" or "has a problem"). The list updates by itself when apps are connected or removed in another tab.
- Connected apps are a server feature: the phone app has none.
- **An app's page on a dashboard.** In a dashboard's edit mode, **Add widget › App page** picks a connected app and one of the pages it offers (for example Habits › Today's habits). The title and size come from the app and can be changed. The widget saves only the app's id and the page's id, so it keeps working after the app is removed and connected again.
- The page comes straight from the app, in a walled-off frame: it can run its own scripts and call its own server, and its links can open new tabs, but its scripts cannot reach Reskon's page or data, and neither it nor a tab it opens can move the Reskon tab elsewhere. **One exception, from how browsers work:** browsers send a site's cookies to every port on the same machine name, so an app on the same machine name as Reskon (for example Reskon at `192.168.0.8:8097` and the app at `192.168.0.8:8098`) receives Reskon's sign-in cookie with every request the browser makes to it, from the widget or the sidebar link alike. Its scripts cannot read the cookie, but its server could use it. Only connect apps you trust there; Settings › Apps warns when an app is on Reskon's machine name. An app on a different machine name (or HTTPS with its own name, see `docs/next-phase.md` 2.1) does not get it. Each time the widget is shown, and on its **Refresh** button, Reskon's server asks the app for a sign-in ticket that works once and for one minute, and opens the page with it, so the page is already signed in and shows no login screen. The token stays on the server. Reskon also hands the page its theme colours, and sends new ones when you change theme; a page in the app's "own" style ignores them.
- What you do inside the page (ticking a habit) is saved by the app, not by Reskon. If the app was removed, no longer offers that page, wants you to sign in again, or cannot be reached, the widget says so, with a **Retry** button. Reskon never shows a page that is on its own address (it would not be walled off). Reskon's own pages still cannot be shown in a frame anywhere.
- The phone app shows such a widget as "Shown in the web app".
- **An app's data on a dashboard.** In edit mode, **Add widget › App data** picks a connected app, one of the data it offers (for example Habits › Today, a checklist, or Habits › Done per day, a series), a chart type that suits it (10.2) and, where the app's data takes them, a date range (Today, Yesterday, 7 days, 30 days, 90 days, Year, This month; not All, which means "since your first Reskon record") and a grouping (for example by day or week). A live preview asks the app as you choose. The title and size come from the app and can be changed. The widget saves only names: `{"app": "habits", "widget": "last_days", "range": "7d", "group": "day"}`.
- Reskon's server asks the app each time the widget is drawn: when shown, on **Refresh**, when your data changes (live updates), and when you change the dashboard's dates (the app is then asked for those dates). It sends the dates as `from` and `to` (counted in your time zone), the grouping, and your time zone, signed in with the token it keeps. Everything the app sends is checked before it is kept or shown: the shape must be the one the app promised, numbers must be numbers, text is plain and short, and there are limits on how many points, rows and items. The app's text is always shown as text, never as markup.
- Under the chart, small, is when the app made the data ("fetched 14:05"). **The cache:** Reskon keeps the last good answer for each widget and range. If the app cannot be reached, is too slow, answers badly or refuses Reskon's sign-in, the widget shows that copy with a note in words: "Showing the copy from 14:05: Habits answered HTTP 503". With no copy, it says why, with a **Retry** button. Each app keeps up to 10 MB of answers per person, and all of a person's apps together up to 50 MB; past that, the least recently read are dropped first. Nothing expires by age. Removing the app removes its copies. If the app now sends that data in another shape, an old copy is never shown, and a chart type that no longer suits it asks you to edit the widget.
- An app's numbers are shown with its own unit, as the app wrote it ("12 days", "3 glasses"). Dates are asked for at most 400 days at a time. Only Reskon's own pages can ask for an app's data (another site's page cannot make Reskon call your apps).
- An app's data is read-only in Reskon and never counts in Reskon's own totals or metrics.
- **An app says "my data changed".** Tick a habit inside the app's page widget, and the app's data widgets beside it (Habits › Today, Done per day…) fetch again within a second, in this tab and in your other open tabs, with no Refresh. A change made elsewhere (on the app's own site) updates them too, if the app supports it: when you connect the app, Reskon gives it a key and the address to call (Reskon's address as your browser reached it). The app's page widgets are never reloaded by this, so what you are doing inside them is left alone. Reskon still sends the app nothing else: no ticks, edits or events. **Check again** and **Sign in again** hand the app a fresh key each time (the old one keeps working until the app has taken the new one), so either cures an app that lost its key. If the app could not take the key, it stays connected and Settings › Apps warns "Reskon won't hear about changes made elsewhere", with why. It also warns when the address handed over may not work (Reskon seems to be behind a proxy that was not declared, or the browser was on HTTPS but the address is plain HTTP). Removing the app stops its key working. How an app does this: `docs/plugins.md` section 7.

---

## 13. The Android app and sync

### 13.1 The app

- **The phone shows views as a list, never as columns.** A board of side-by-side columns means a lot of sideways scrolling on a narrow screen, so the phone app has no columns layout. Every view opens as a **List** (a section for each status, or each priority, area, energy type or epic, chosen under the layout button) or as a **Timeline**; a view that is a Board or Table on the web app opens as the List here. Choosing List or Timeline on the phone changes only whether the timeline is on, not the view's layout as the web app sees it. Each row shows the title, its area, energy type, due date and tags, and how long it has been in its status. Above the list is a wrapping row of rectangular buttons, one per group (by default one per status, with its count): tapping one jumps to that section, and it never scrolls sideways. Tasks in a status that is off the board (Backlog and Cancelled by default) are left out until that status's button is tapped, which also opens its section (tap again to close it). The Snoozed, Blocked and Incomplete buttons sit on the top line right after the view's name (wrapping under it when there is no room). Whether a status shows on the board is set in Settings › Statuses (*Show on the board*), on the phone as on the web. Column limits (work-in-progress limits) are drawn only on the web app.
- **Tags on the phone.** Settings › Tags lists, renames, adds and deletes tags. A task's Tags row opens a sheet to pick existing tags or type a new one; board cards show a task's tags. The session form shows the task's tags (they follow the task) and lets you add the session's own (never one the task already has). The New task form has a Tags row with the same sheet. The Sessions screen has a **Tags** filter button (a tag, or "No tags"; the filter row scrolls sideways) that narrows both the list and each day's totals, by the same rule as the web: the task's tags or the session's own. In quick capture each entry shows its tags: the ones the model picked from the tags that exist, plus any `#word` typed that matches one; tap an entry to change them. **Create new task** is the first row of the session form's task picker (and so of quick capture's session entries): a title and an area, then the task exists and is picked.
- **Version.** Reskon has one version number (`major.minor.patch`, in the `VERSION` file). The web app shows it on the sign-in page and in Settings › About, the phone in Settings › About (and, when connected, a *Server* row with the server's version, read from the server's health check). Beside the version is the **day it was last updated** (for example "Updated 13 Nov 2026"): the web app's Settings › About and the phone's *Server* row show it, and `GET /api/health` returns it as `updated` (year-month-day). See the README.
- A Kotlin and Jetpack Compose app (Material 3, the web app's dark colours) in `mobile/android`. It is called **Reskon** on the phone (app id `com.aakash.reskon`). The release APK is signed with the Reskon key kept outside the repo and built, checked and copied to the Linux machine by `mobile/release.ps1` (why: `docs/decisions.md`).
- **It works fully on its own.** It runs Reskon's own Go code inside the app (built as a library, `mobile/jbcore`), with its own database file on the phone. Every screen reads and writes through it, so everything works offline and every number is worked out by the same code as the server.
- Screens: Today (plan and readout, only while the Day screen is switched on; the app opens on Board otherwise), Log session, Quick capture, Sessions, Inbox, Board / List / Timeline, Task, New task, Search, Buffs and debuffs, Dashboards, Cycle time, More, and Settings (everything in section 12, plus Sync server and Download database; Settings › Screens has the Day screen switch).
- **Snoozed and blocked tasks on the phone work as on the web.** A snoozed task is not in the Board, List or Timeline until it wakes. A blocked task is left out too while the view hides blocked tasks (the default, and the view's own choice, shared with the web). Views that never made that choice now hide blocked tasks too, so after updating, blocked tasks leave the phone's lists and sit under **Blocked**. A done task that still has an open blocker counts as blocked as well, as on the web.
- **Snoozed, Blocked and Incomplete are small buttons** on the top line right after the view's name (wrapping under it when there is no room; while searching, just below the search box), each shown only when it has tasks, with its count (the counts follow the current search). Each opens a list; tap a task to open it. **Snoozed** lists tasks with the day each comes back (or what it waits for), those waiting on a blocker first, and a **Wake now** button. **Blocked** says what each is waiting on and has the "hide them from this view" switch. **Incomplete** says what each lacks, once Settings › Complete details asks for something. A list closes by itself when its last task leaves. The buttons stay big enough to tap at any text size by scrolling sideways.
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
- **Live updates.** An open tab updates by itself when your data changes anywhere else: another tab, the phone's sync, and a connected app (12.4). Example: you log a session on the phone, and the Sessions screen already open on your laptop shows it within a second or two, with no refresh. The server sends each of your tabs a short note ("tasks changed"), never the data, and the tab reloads what it shows. It waits while the tab is hidden or while you are dragging a card, then reloads once. A title or description you are typing in the task panel is kept. The tab that made a change gets no note about it. Notes only go to your own tabs, never another person's. A phone sync that only fetched sends no note. **A tab left open for hours or overnight stays connected.** If the connection drops it tries again (after 1 s, then 2, 4, 8 … up to every 30 s) and, once back, reloads what is on screen once, because changes may have been missed meanwhile. A connection can also die without the browser noticing (the laptop slept, wifi changed), so the tab replaces its connection straight away when the network comes back, when you return to a tab you were away from for more than 30 seconds, and when the tab finds its clock jumped (it was asleep). Example: close the lid on Friday, open it on Monday, and the board shows Monday's data within a moment. If your sign-in has ended, the tab shows the sign-in page instead of failing quietly. An open tab on its own does not keep you signed in: only using the app does. A connected app saying its data changed (12.4) sends a note too, naming only the app (for example "habits"): then only that app's data widgets fetch again (straight away, without waiting for a hidden tab or a drag, since nothing on screen moves but those widgets), nothing else reloads, and the app's own page widgets are left as they are. It comes from the app's page inside a widget (passed on to your other tabs) or from the app's own server, at most once every 2 seconds per app.
- **When a screen can't load, it says so.** A board, table or session list that fails to load while the server is reachable (an error from the server, not a dropped connection) shows what went wrong with a **Retry** button. If older data is already on screen it stays, under a warning that it may be out of date. A slow answer for a view, range or filter you have already left never replaces what you are looking at.

---

## 15. How the data is stored

### 15.1 Files

- `<data>/auth.db`: accounts and sign-in sessions, and (table `app_hook`, migration 002) the keys connected apps use to say "my data changed": a hash of each key (never the key), whose it is and which app. One per person per app. It is here, not in the apps file, because the app's call carries no sign-in, so the key alone must say whose app it is.
- `<data>/users/<name>-<id>.db`: one database per person, all with the same tables.
- `<data>/users/<name>-<id>.apps.db`: that person's connected apps and their sign-ins (12.4), and the cache of what their apps answered (table `app_cache`, migration 002 of the apps file: app, widget, what was asked, the checked answer, its size, when the app made it and when it was last read), made when first needed. Migration 003 adds to each app whether it took its "my data changed" key (`changes`: empty, `ok` or `failed`, and `changes_detail`, why). Kept apart so a sign-in never syncs to a phone or reaches the browser. The file gives freed space back to the disk as it goes (SQLite's incremental auto-vacuum, switched on once when the file is opened). A backup copies the apps and their sign-ins but not the cache, which is rebuilt by fetching again.
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
| `tag`, `task_tag`, `session_tag` | Tags (unique ignoring capitals), the tags on each task, and the tags put on a session by hand. A session's other tags come from its task when read. |
| `session` | Logged time: hours, date, start time, description, task, area, task/event, energy type, level, points, note, custom fields, last changed. |
| `session_energy` | The parts of a session with several energy types: share, level, points. |
| `session_subtype` | A session's ranked subtypes. |
| `day_plan` | Each day's focus, ceilings and evening answers. |
| `state` | Buffs, debuffs and modifiers. |
| `inbox_item` | Inbox lines. |
| `view` | Saved views: filter, layout, card settings, board settings (grouping, sorting, column limits, collapsed columns, timeline), icon, colour, background. |
| `image` | Uploaded background images. |
| `dashboard`, `widget` | Dashboards and their widgets (a chart's `query` may hold `from` and `to` dates instead of a `range`; its `options` may hold `color`, `series_colors` and the other chart settings of 10.2a, and unknown options are kept): the source (`metric`, `view`, `app_data`, `app_page` or `journal`; migration 019 holds the column), the question (a metric query; for `view` just `{"view_id"}`, the view's id; for `journal` just `{"range"}`; for `app_page` just `{"app", "widget"}`, the app's and its page's ids; for `app_data` also the feed's `range` and `group` where it takes them), the chart type (always `board` for a view, `journal` for a journal, `page` for an app page; `checklist` only for app data), position. A widget keeps its source. |
| `custom_field` | Custom field definitions. |
| `setting` | Your settings, each a JSON value: subtype weights, capture model, week start, task dates, snooze, complete details, card actions, epic columns, time zone, theme… |
| `task_embedding` | A cache for duplicate search (can be emptied, nothing is lost). |
| `sync_meta`, `sync_idmap`, `sync_field` | Sync: this database's device id and clocks, each record's uid, and when each field last changed. Only the latest change per field is kept, so it never grows beyond the data. Small database rules (triggers), made by the Go code from one table list on every start, fill these in. |

### 15.3 Rules for the database

- **Migrations only add.** Once a database exists, a new version may add tables, columns or rows, and may fill them in, but never removes or rebuilds anything. The version applied is kept in SQLite's own header (`user_version`).
- Times are UTC text with a fixed width, so sorting text sorts by time.
- Most deletes only set `deleted_at`, so history still points at real rows.
- Values worked out from others are never stored, with one exception: a session's points (section 6.3).
- Migrations so far: 001 the first tables; 002 epics and board settings; 003 intensity becomes 1–5; 004 view icons, colours and backgrounds; 005 dashboards and stored points; 006 all energy types equal; 007 pies and shares; 008 retire "Energy drain felt"; 009 several energy types per session; 010 start and end dates; 011 snooze; 012 duplicate search cache; 013 subtasks; 014 dependencies; 015 inbox; 016 sync; 017 session "last changed", start dates filled in, unfinished parts hidden; 018 tags; 019 where a widget's content comes from (metric, view, app data or app page); 020 the Home dashboard (rows only, no new tables or columns); 021 repairs widgets that reached a not-yet-upgraded device from a newer one (their kind is read back from the chart type or query, and a Board's view from its sync id; rows only); 022 adds the Buffs and debuffs widget at the top of Home (one row added, the other Home widgets move down two rows; rows only).

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
| `GET /api/snooze/forecast?dates=2026-11-18,2026-11-19&exclude=:id` | For each date asked (up to 100, `YYYY-MM-DD`), `{date, hours, points}` of snoozed tasks already waking that day (see 4.12); `exclude` is the task being snoozed. Only reads your own tasks; a bad date is a 400. |
| `GET /api/tasks/:id/transitions`, `GET /api/cycle-time?view=:id` | Move history and cycle time. |
| `GET /api/tasks/similar?q=` | Duplicate search. `/api/semantic` for the meaning model. |
| `POST /api/task-links`, `DELETE /api/task-links/:id` | Dependencies. |
| `GET POST /api/sessions`, `PATCH DELETE /api/sessions/:id`, `POST /api/sessions/bulk` | Sessions. |
| `POST /api/capture` | Reads a line. **Never saves anything.** |
| `/api/inbox` | Inbox lines, triage, discard. |
| `GET PATCH /api/day/:date` | The day's plan, readout and totals. |
| `GET /api/journal?from=&to=`, `GET /api/journal?widget=:id` (optionally `&from=&to=`) | What you did each day, for Copy as Markdown (6.4) and the journal widget (10.1). Answers `{from, to, days, more}`; each day (newest first, days without sessions left out) has `day`, `hours`, `points` (the day's totals, from the server), `markdown` (the day ready to paste) and `sessions` (`id`, `task_id`, `what`, `area`, `kind`, `start` and `end` as local HH:MM or null, `hours`, `note`); never a task key. By dates: the newest 366 days with sessions in them (`more: true` when older ones were left out). By widget: the widget's own range, or the dashboard's dates, and at most the newest 62 days (`more: true` when older ones were left out); a widget that is not a journal is a 400, another person's widget a 404. Only reads, so no live note. |
| `GET /api/metrics`, `GET /api/metrics/catalog` | Chart data (by query, or `?widget=:id`) and what each metric allows. The answer holds `points`, `series`, `total` and `average` (the mean per day, week or group value, also per series; left out for running totals or no points). |
| `/api/dashboards`, `/api/widgets`, `PATCH /api/dashboards/:id/layout` | Dashboards. A board widget is saved through `/api/widgets` with `source: "view"`, `viz: "board"` (the default) and `query: {"view_id": <view id>}`; the view must exist and not be deleted (400 otherwise), and the query may hold nothing else. Its tasks are read with `GET /api/tasks?view=:id`, the same call the board uses; there is no new endpoint, so the widget never sends a filter. Between devices the view id is swapped for the other device's own id for that view. |
| `/api/states`, `GET /api/states/shapes` | Buffs and debuffs. |
| `/api/areas`, `/api/statuses`, `/api/status-categories`, `/api/priorities`, `/api/energy-types`, `/api/subtypes`, `/api/custom-fields`, `/api/views` | Your lists. DELETE takes `?reassign_to=:id` (and `?clear=true` for priorities). |
| `GET POST /api/tags`, `PATCH DELETE /api/tags/:id` | Tags. A task or session gets its tags through its own `tags` field, a list of names (a session's list is its own tags). `GET /api/sessions?tag=1,2` filters by tag. |
| `PUT /api/settings/:key` | Save a setting. |
| `POST /api/tasks/delete` | Delete up to 1000 tasks at once (`task_ids`; `subtasks: "delete"` takes their subtasks too). All or nothing. |
| `POST /api/images`, `GET /api/images/:id` | Background images. |
| `POST /api/sync` | Sync: a device sends its changes and gets back what it hasn't seen. The `X-Sync-Size` header gives the answer's size before compression, for the phone's progress bar. |
| `POST /api/sync/outgoing`, `POST /api/sync/incoming` | Used by the phone's built-in core: get the request to send, apply the answer. |
| `GET /api/live` | A WebSocket: a note `{topic, tab}` each time your data changes (topic is the changed part, such as `tasks`; tab is the `X-Reskon-Tab` header of the request that changed it). A connected app's data changing is `{topic: "app_data", app: "<app id>"}`. At most 32 open per person; closed after you sign out. |
| `GET /api/apps`, `POST /api/apps` (`address` plus `token`, or `username` and `password`), `POST /api/apps/preview`, `POST /api/apps/:id/check`, `POST /api/apps/:id/sign-in`, `DELETE /api/apps/:id` | Connected apps (12.4). Answers never contain the sign-in token. An app that could not be reached answers 502 with the reason. Not on the phone. |
| `POST /api/apps/:app/changed` (`:app` is the app's id, such as `habits`) | Reskon's page passing on "changed" from an app's page in a frame: sends the person's other tabs an `app_data` note (not the general `apps` one), at most one per 2 seconds per app, and answers 204. 404 for an app that is not connected. Not on the phone. |
| `POST /api/apps/changed` (`Authorization: Bearer <key>`, no cookie) | An app's own server saying its data changed, with the key Reskon gave it at its `connect_url` (`docs/plugins.md` 7). POST only. Answers 204 for any key, good, unknown or malformed (401 without a `Bearer` key); a good key sends that person's tabs an `app_data` note, at most one per 2 seconds per app, shared with the page route above (calls in between become one note at the end of the wait). The body is ignored. An address whose keys miss 30 times in a minute is not looked up for the rest of it. A request from another site's page is refused. Not on the phone. Connect, **Check again** and **Sign in again** answer with `changes` and `changes_detail` on the app. |
| `POST /api/apps/launch` (`{"widget": <widget id>}`) | For an app page widget, the address to load in its frame: `{url, origin, style, title}`, with a one-minute ticket after `#ticket=` when the app signs in (the browser adds `&theme=`). 404 with the reason if the app or the page is gone, 400 if Reskon must sign in to the app again (never 401), 502 if the app cannot be reached. Sends no live note. Not on the phone. An app page widget is saved through `/api/widgets` with `source: "app_page"` and `query: {"app": "<app id>", "widget": "<page id>"}`; the app must be connected and offer that page. |
| `GET /api/apps/data?widget=:id` (optionally `&from=&to=`, the dashboard's dates), `GET /api/apps/data/preview?app=&widget=&range=&group=&viz=` | An app data widget's data (by saved widget, or in full for the editor's preview): the metrics' answer shape (`points`, `series`, `total`, `unit`, `group`, `from`, `to`) plus `shape`, `label`, `table` (`columns` and `rows`, for a table) and `fetched_at`; `stale: true` with `stale_reason` when it is the kept copy because the app could not be asked. With no copy: 404 if the app or its data is gone, 400 if Reskon must sign in to the app again or the app's answer was unusable (never 401), 502 if the app cannot be reached. Sends no live note. Not on the phone. An app data widget is saved through `/api/widgets` with `source: "app_data"`, a `viz` that suits the data's shape, and `query: {"app", "widget", "range"?, "group"?}`; the app must be connected and offer that data, the range only for data that takes one, the group one it lists. |

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
