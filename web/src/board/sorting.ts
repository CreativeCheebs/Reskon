import type { BoardSort, Bootstrap, Task } from "../types";

// Card order within a board column. "manual" is the dragged order
// (board_pos); the others are display orders only, worked out from values
// the server sent, with the dragged order breaking ties.

export const SORT_OPTIONS: { value: BoardSort; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "priority", label: "Priority, highest first" },
  { value: "due", label: "Due date, soonest first" },
  { value: "difficulty", label: "Intensity, highest first" },
  { value: "estimate", label: "Estimate, largest first" },
  { value: "time_in_status", label: "Time in status, longest first" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export function boardComparator(sort: BoardSort, boot: Pick<Bootstrap, "priorities">): (a: Task, b: Task) => number {
  const weight = (t: Task) => boot.priorities.find((p) => p.id === t.priority_id)?.weight ?? 1;
  // Missing values sort last whichever way the order runs.
  const desc = (x: number | null, y: number | null) => (y ?? -Infinity) - (x ?? -Infinity);
  const key = (a: Task, b: Task): number => {
    switch (sort) {
      case "priority":
        return weight(b) - weight(a);
      case "due":
        return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
      case "difficulty":
        return desc(a.difficulty, b.difficulty);
      case "estimate":
        return desc(a.estimate_h, b.estimate_h);
      case "time_in_status":
        return b.time_in_status_h - a.time_in_status_h;
      case "newest":
        return b.created_at.localeCompare(a.created_at);
      case "oldest":
        return a.created_at.localeCompare(b.created_at);
      default:
        return 0;
    }
  };
  return (a, b) => key(a, b) || a.board_pos - b.board_pos;
}
