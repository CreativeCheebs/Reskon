# JitterBug — Change 002: Points follow edits

Oct 30, 2026 · @Aakash Kumar · Applies to: Phase 2 build spec (amends "Editing an old session never recalculates its points")

## Summary

A session's points are worked out again when you edit something they depend on: its hours, its intensity, its energy types or their shares, or its task. When you change nothing but an energy type's rate has changed since, the session offers to recalculate; nothing changes until you choose to. Points are no longer typed in by hand.

## Why

Points that ignore your own corrections are wrong. Fixing a session's duration or intensity and keeping the old points kept a number that no longer described the session. Rates are different: a rate change is a choice about the future, so old sessions keep what they earned unless you ask.

## What changes

1. **Edits recalculate.** Saving a session whose hours, intensity, energy types, shares or task changed stores fresh points at today's rates. The same applies to bulk changes of energy type, intensity or task.
2. **Rate changes don't.** A session whose inputs are unchanged keeps its stored points when a rate changes. The API returns `points_now`, what the session would earn at today's rates. When it differs, the session form offers **Recalculate**, and the bulk bar offers **Recalculate points** for many sessions at once.
3. **No hand-typed points.** The Points field in the session form is read-only. The API still takes `points` on a PATCH, so an import or a script can set them.

## What stays

- Points are still stored when a session is logged, never worked out when read.
- The formula: hours × share × the type's rate × intensity (the part's, else the task's, else 1).
