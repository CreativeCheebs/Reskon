import type { Task } from "../types";

// Sections of the task panel added by later steps: custom fields, sessions,
// cycle time.
export function TaskExtras(_props: {
  task: Task;
  patch: (changes: Record<string, unknown>) => Promise<void>;
  onTaskChanged: () => void;
}) {
  return null;
}
