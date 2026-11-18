import type { Area } from "../types";
import type { SessionDraft } from "../sessions/SessionForm";
import type { DayItem, TimerDraft } from "./types";

// What the session form starts with when a planner line (or a stopped
// timer) opens it. The form still decides what can be saved.

/** The form's starting values for logging against a plan line on `day`. */
export function sessionStartFor(item: DayItem, day: string, areas: Area[]): { initial: Partial<SessionDraft>; extra?: Record<string, unknown> } {
  if (item.kind === "task") {
    return { initial: { task_id: item.task_id, area_id: item.area_id, logged_for: day } };
  }
  return eventStart(item.title, item.area_id, day, item.id, areas);
}

function eventStart(title: string, areaId: number | null, day: string, itemId: number, areas: Area[]) {
  const area = areas.find((a) => a.id === areaId);
  return {
    initial: {
      kind: "event" as const,
      task_id: null,
      label: title,
      area_id: areaId,
      // An event with no area default leaves the energy type for the person to choose.
      energy_type_id: area?.default_energy_type_id ?? null,
      logged_for: day,
    },
    extra: { day_item_id: itemId },
  };
}

/** The form's starting values for a stopped timer's draft, and the extra fields its save carries. */
export function sessionStartForDraft(draft: TimerDraft, taskArea: number | null, eventArea: number | null, areas: Area[]): { initial: Partial<SessionDraft>; extra: Record<string, unknown> } {
  const extra: Record<string, unknown> = { ended_at: draft.ended_at, ...(draft.day_item_id ? { day_item_id: draft.day_item_id } : {}) };
  if (draft.kind === "event") {
    const s = eventStart(draft.label ?? "", eventArea, draft.logged_for, draft.day_item_id ?? 0, areas);
    return { initial: { ...s.initial, hours: draft.hours, started_at: draft.started_at }, extra };
  }
  return { initial: { task_id: draft.task_id ?? null, area_id: taskArea, logged_for: draft.logged_for, hours: draft.hours, started_at: draft.started_at }, extra };
}
