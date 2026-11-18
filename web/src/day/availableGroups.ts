import type { Behaviour, Status, Task } from "../types";

export interface StatusGroup {
  status: Status;
  tasks: Task[];
}

/**
 * Open tasks grouped by status for the Available tasks list: one group per
 * to-do or in-progress status (in board order, empty ones kept so a planned
 * task can be dropped back on them), leaving out epics, tasks already on the
 * day, and, when `query` is given, tasks whose title or key does not contain it.
 */
export function groupAvailable(tasks: Task[], statuses: Status[], behaviourOf: (statusId: number) => Behaviour | undefined, plannedTaskIds: Set<number>, query = ""): StatusGroup[] {
  const q = query.trim().toLowerCase();
  const open = statuses
    .filter((s) => {
      const b = behaviourOf(s.id);
      return b === "todo" || b === "in_progress";
    })
    .sort((a, b) => a.position - b.position);
  return open.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status_id === status.id && t.type !== "epic" && !plannedTaskIds.has(t.id) && (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))),
  }));
}
