import type { Session } from "../types";

// A session's name, the same rule everywhere it is listed: its own title,
// else its task's title, else its label (the description). `taskTitle` looks
// up a task's title by id; `fallback` is used when there is none of these.
export function sessionName(
  s: Pick<Session, "title" | "task_id" | "label">,
  taskTitle: (id: number) => string | undefined,
  taskWord: string,
  fallback: string,
): string {
  const own = s.title?.trim();
  if (own) return own;
  if (s.task_id) return taskTitle(s.task_id) ?? `${taskWord} #${s.task_id}`;
  return s.label?.trim() || fallback;
}

/** Whether the name above came from the label, so a Description column
 *  can leave it out instead of showing it twice. */
export function nameIsLabel(s: Pick<Session, "title" | "task_id">): boolean {
  return !s.title?.trim() && !s.task_id;
}

/** The description to show in its own column: nothing when it is blank, is
 *  already the name (no title, no task), or says the same as the shown name. */
export function descriptionToShow(s: Pick<Session, "title" | "task_id" | "label">, shownName: string): string | null {
  const d = s.label?.trim();
  if (!d || nameIsLabel(s) || d === shownName.trim()) return null;
  return d;
}
