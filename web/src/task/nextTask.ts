import { api } from "../api";
import { today } from "../format";
import type { RoundKind, Task } from "../types";

// Continue a task, and rounds of the same task (SPEC 4.17): the three calls,
// and which epic question a task gets. The server makes everything in one
// step and refuses a choice that does not fit the task.

/** Which form the "What's next?" box shows. */
export type NextMode = "continue" | "round";

/** What a continued task can take from the old one, besides its area. */
export const COPY_KEYS = ["energy_type", "priority", "level", "tags"] as const;
export type CopyKey = (typeof COPY_KEYS)[number];

/** The epic question, which depends on the old task:
 *  - free: a task in no epic (make one for both, pick one, or none);
 *  - in_epic: a task in an epic (keep both in it, or the new one has none);
 *  - subtask: the next subtask of the same parent, or a task of its own;
 *  - epic: an epic, whose next one is an epic too (no question). */
export type EpicCase = "free" | "in_epic" | "subtask" | "epic";

export function epicCaseOf(t: Pick<Task, "type" | "parent_id" | "epic_id">): EpicCase {
  if (t.type === "epic") return "epic";
  if (t.parent_id !== null) return "subtask";
  if (t.epic_id !== null) return "in_epic";
  return "free";
}

export type EpicChoice = "same" | "new" | "pick" | "none";

export interface ContinueBody {
  title: string;
  copy: CopyKey[];
  epic: EpicChoice;
  epic_title?: string;
  epic_id?: number;
  separate: boolean;
  today: string;
}

export const continueTask = (id: number, body: ContinueBody) => api.post<Task>(`/tasks/${id}/continue`, body);

export const nextRound = (id: number, body: { kind: RoundKind; snooze_until: string | null }) =>
  api.post<Task>(`/tasks/${id}/next-round`, { ...body, today: today() });

export const setRoundKind = (id: number, kind: RoundKind) => api.post<Task>(`/tasks/${id}/round-kind`, { kind });
