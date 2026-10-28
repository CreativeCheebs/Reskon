# Deviations from the build spec

Where the code differs from `build_spec_phase_1.md`, and why.

## Implemented differently

### Subtypes ship empty
Section 3 lists subtype seeds; section 12 ("Deferred, not open") says Phase 1 ships the table empty and the user adds their own on first run. Followed section 12 as the later decision. The section 3 list can be added from Settings → Subtypes in a minute.

### All five seeded statuses are builtin
Section 3 marks the categories and priorities builtin but does not say which statuses are. All five seeded statuses (Backlog, To do, In progress, Done, Cancelled) are `is_builtin = 1` so the backlog overlay and the "move out of backlog" rule always have a target.

## Needs review

### Creating an area also creates its board view
Section 7 asks for "one view per area" on first run, but areas ship empty and are created by the user. So `POST /api/areas` creates a board view for the new area in the same transaction. Deleting the area does not delete the view.

### An area with tasks cannot be deleted
The spec does not say what happens to tasks when their area is deleted. Every task needs exactly one area, so deletion is refused with 409 until the tasks are moved. Most reversible option.

### Extra endpoints
- `GET /api/health` — used by the client to detect offline/online.
- `PUT /api/settings/:key` — the spec puts the LLM endpoint and model in `setting` but lists no write endpoint for it. `llm_api_key` is write-only (never returned by bootstrap).
- `GET /api/tasks/:id` — single-task read for the task panel.
