import type { Priority } from "../types";

// The `default_priority` setting: the priority a new task gets when none is
// chosen. The server applies it; this only tells the screens what it is.
// With no setting it is the built-in priority with weight 1 (Normal).

export function defaultPriorityId(settings: Record<string, unknown>, priorities: Priority[]): number | null {
  const s = settings.default_priority as { priority_id?: unknown } | undefined;
  if (s && "priority_id" in s) {
    const id = s.priority_id;
    return typeof id === "number" && priorities.some((p) => p.id === id) ? id : null;
  }
  const normal = [...priorities].sort((a, b) => a.position - b.position).find((p) => p.is_builtin && p.weight === 1);
  return normal ? normal.id : null;
}
