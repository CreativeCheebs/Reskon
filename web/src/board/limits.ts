import type { ColumnLimit, Task } from "../types";
import { formatHours } from "../format";
import type { Terms } from "../terms";

// Column limits (WIP) for one board view: a maximum per status, counted in
// tasks, points or estimated hours over every card the view shows in that
// column (all swimlanes together). A soft limit only colours the header; a
// hard one asks before a card is moved in past it.

export const limitUnits = (T: Terms): { value: ColumnLimit["unit"]; label: string }[] => [
  { value: "tasks", label: T.Tasks },
  { value: "points", label: "Points" },
  { value: "hours", label: "Estimate hours" },
];

/** What one card adds to a column under this limit's unit. */
export function limitWeight(t: Task, unit: ColumnLimit["unit"]): number {
  if (unit === "points") return t.points ?? 0;
  if (unit === "hours") return t.estimate_h ?? 0;
  return 1;
}

/** The column's current use, from the cards the server sent. */
export function limitUse(tasks: Task[], statusId: number, limit: ColumnLimit): number {
  return tasks.filter((t) => t.status_id === statusId).reduce((n, t) => n + limitWeight(t, limit.unit), 0);
}

export function formatLimit(n: number, unit: ColumnLimit["unit"]): string {
  if (unit === "hours") return formatHours(Math.round(n * 10) / 10);
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit === "points" ? `${v} pts` : v;
}
