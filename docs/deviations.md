# Deviations from the build spec

Where the code differs from `build_spec_phase_1.md`, and why.

## Implemented differently

### Subtypes ship empty
Section 3 lists subtype seeds; section 12 ("Deferred, not open") says Phase 1 ships the table empty and the user adds their own on first run. Followed section 12 as the later decision. The section 3 list can be added from Settings → Subtypes in a minute.

### All five seeded statuses are builtin
Section 3 marks the categories and priorities builtin but does not say which statuses are. All five seeded statuses (Backlog, To do, In progress, Done, Cancelled) are `is_builtin = 1` so the backlog overlay and the "move out of backlog" rule always have a target.

## Needs review
