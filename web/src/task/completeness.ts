import type { Terms } from "../terms";

// The fields Settings → Complete details can require, with their names.
// The server works out which a task is missing (Task.missing).

export const COMPLETENESS_FIELDS: { key: string; label: string }[] = [
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date" },
  { key: "due_at", label: "Due date" },
  { key: "estimate_h", label: "Estimate (max time)" },
  { key: "difficulty", label: "Level" },
  { key: "priority_id", label: "Priority" },
  { key: "energy_type_id", label: "Energy type" },
  { key: "description", label: "Description" },
  { key: "epic_id", label: "Epic" },
];

/** The fields with the epic's own name in the list. */
export const completenessFields = (T: Terms) => COMPLETENESS_FIELDS.map((f) => (f.key === "epic_id" ? { ...f, label: T.Epic } : f));

export const fieldLabel = (key: string, T: Terms) => completenessFields(T).find((f) => f.key === key)?.label ?? key;

/** The fields the setting requires; empty means every task is complete. */
export function requiredFields(settings: Record<string, unknown>): string[] {
  const r = (settings.task_completeness as { required?: unknown } | undefined)?.required;
  return Array.isArray(r) ? r.filter((k): k is string => typeof k === "string") : [];
}
