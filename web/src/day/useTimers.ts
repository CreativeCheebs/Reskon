import { useState } from "react";
import { api, ApiError } from "../api";
import { message } from "../theme/feedback";
import type { Area, Task } from "../types";
import { sessionStartForDraft } from "./logSession";
import type { SessionDraft } from "../sessions/SessionForm";
import type { Run } from "./usePlanner";
import type { DayItem, TimerDraft, TimerList, TimerRow } from "./types";

/** A stopped timer's draft, ready for the session form to review. */
export interface OpenDraft {
  initial: Partial<SessionDraft>;
  extra: Record<string, unknown>;
}

/** Starting, stopping and the draft that follows. The draft is not saved until the person saves it. */
export function useTimers(day: string, run: Run, items: DayItem[], areas: Area[]) {
  const [draft, setDraft] = useState<OpenDraft | null>(null);
  // A start refused because a timer is already running: the one that is.
  const [blocked, setBlocked] = useState<TimerRow | null>(null);

  const start = async (item: DayItem) => {
    const body = item.kind === "event" ? { day, day_item_id: item.id } : { day, task_id: item.task_id };
    try {
      await api.post("/timers", body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const cur = e.current as TimerList | undefined;
        setBlocked(cur?.timers?.[0] ?? null);
        if (!cur?.timers?.length) message.error("A timer is already running.");
      } else {
        message.error((e as Error).message);
      }
    }
    await run(async () => undefined);
  };

  const stop = async (t: TimerRow) => {
    let reply: { draft: TimerDraft } | null = null;
    await run(async () => {
      reply = await api.post<{ draft: TimerDraft }>(`/timers/${t.id}/stop`);
    });
    const d = (reply as { draft: TimerDraft } | null)?.draft;
    if (!d) return;
    // Where the draft's task or event sits, so the form starts with its area.
    let taskArea: number | null = null;
    if (d.kind === "task" && d.task_id) {
      taskArea = items.find((i) => i.task_id === d.task_id)?.area_id ?? (await api.get<Task>(`/tasks/${d.task_id}`).then((x) => x.area_id).catch(() => null));
    }
    const eventArea = items.find((i) => i.id === d.day_item_id)?.area_id ?? null;
    setDraft(sessionStartForDraft(d, taskArea, eventArea, areas));
  };

  return { draft, closeDraft: () => setDraft(null), blocked, closeBlocked: () => setBlocked(null), start, stop };
}
