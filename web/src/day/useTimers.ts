import { useRef, useState } from "react";
import { api, ApiError } from "../api";
import { message } from "../theme/feedback";
import type { Area, Task } from "../types";
import { sessionStartForDraft } from "./logSession";
import type { SessionDraft } from "../sessions/SessionForm";
import type { Run } from "./usePlanner";
import type { DayItem, TimerDraft, TimerList, TimerRow } from "./types";

/** A stopped timer's draft, open in the session form for review. */
export interface OpenDraft {
  initial: Partial<SessionDraft>;
  extra: Record<string, unknown>;
}

/**
 * Starting, pausing, stopping and reviewing timers. Stop keeps the timer on
 * the server as "stopped" with its draft; it is retired when the session is
 * saved (the save carries timer_id) or when the person discards the time.
 * Cancelling the form leaves the time pending. Each call is sent once at a
 * time, so a double click cannot start or stop twice.
 */
export function useTimers(day: string, run: Run, items: DayItem[], areas: Area[]) {
  const [draft, setDraft] = useState<OpenDraft | null>(null);
  // A start refused because timers are running: those timers, and the start wanted.
  const [blocked, setBlocked] = useState<TimerRow[] | null>(null);
  const [wanted, setWanted] = useState<DayItem | null>(null);
  // The start to offer once the review is over.
  const [offer, setOffer] = useState<DayItem | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const guard = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const start = (item: DayItem) =>
    guard(async () => {
      const body = item.kind === "event" ? { day, day_item_id: item.id } : { day, task_id: item.task_id };
      try {
        await api.post("/timers", body);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const running = ((e.current as TimerList | undefined)?.timers ?? []).filter((t) => t.running);
          if (running.length) {
            setWanted(item);
            setBlocked(running);
          } else message.error("A timer is already running.");
        } else {
          message.error((e as Error).message);
        }
      }
      await run(async () => undefined);
    });

  const act = (t: TimerRow, action: "pause" | "resume") =>
    guard(async () => {
      await run(() => api.post(`/timers/${t.id}/${action}`));
    });

  /** Open the session form for a stopped timer's draft. */
  const review = async (t: TimerRow, d: TimerDraft) => {
    let taskArea: number | null = null;
    if (d.kind === "task" && d.task_id) {
      taskArea = items.find((i) => i.task_id === d.task_id)?.area_id ?? (await api.get<Task>(`/tasks/${d.task_id}`).then((x) => x.area_id).catch(() => null));
    }
    const eventArea = items.find((i) => i.id === d.day_item_id)?.area_id ?? null;
    setDraft(sessionStartForDraft(d, t.id, taskArea, eventArea, areas));
  };

  const stop = (t: TimerRow) =>
    guard(async () => {
      let d: TimerDraft | undefined;
      await run(async () => {
        d = (await api.post<{ draft: TimerDraft }>(`/timers/${t.id}/stop`)).draft;
      });
      if (d) await review(t, d);
    });

  /** The review is over (saved, cancelled or discarded): offer the start that was waiting. */
  const finish = () => {
    setDraft(null);
    if (wanted) setOffer(wanted);
    setWanted(null);
  };

  const discard = (t: TimerRow) =>
    guard(async () => {
      if (await run(() => api.del(`/timers/${t.id}`))) finish();
    });

  return {
    draft,
    busy,
    blocked,
    offer,
    closeBlocked: () => {
      setBlocked(null);
      setWanted(null);
    },
    /** Stop one of the blocking timers; the start that was wanted is offered after its review. */
    stopBlocking: (t: TimerRow) => {
      setBlocked(null);
      return stop(t);
    },
    closeOffer: () => setOffer(null),
    start,
    pause: (t: TimerRow) => act(t, "pause"),
    resume: (t: TimerRow) => act(t, "resume"),
    stop,
    discard,
    /** A stopped timer's "review": open its draft again. */
    reviewStopped: (t: TimerRow) => (t.draft ? review(t, t.draft) : undefined),
    finish,
  };
}
