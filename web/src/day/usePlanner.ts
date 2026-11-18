import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import type { DayData } from "./types";

/**
 * One day of the planner: the server's answer for that day (lines, totals,
 * timers) and a way to change it. Every change is sent, then the day is read
 * again, so the figures on screen are always the server's. Only the newest
 * answer is kept: a read started before a change but answered after it must
 * not put the old numbers back.
 */
export function usePlanner(day: string) {
  const { reloadKey } = useApp();
  const [data, setData] = useState<DayData | null>(null);
  // When `data` was read, so a running timer can tick on from here.
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const seq = useRef(0);
  // Why the day could not be read, while there is nothing on screen to keep showing.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await api.get<DayData>(`/day/${day}`);
      if (n === seq.current) {
        setData(d);
        setError(null);
        setFetchedAt(Date.now());
      }
    } catch (e) {
      if (n !== seq.current) return;
      setError((e as Error).message);
      message.error((e as Error).message);
    }
  }, [day]);

  // Another day starts blank; a reload of the same day keeps it on screen.
  useEffect(() => {
    setData(null);
    setError(null);
  }, [day]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  /** Do one change, show its error, and read the day again either way. Returns whether it worked. */
  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      let ok = true;
      try {
        await fn();
      } catch (e) {
        ok = false;
        message.error((e as Error).message);
      }
      await load();
      return ok;
    },
    [load],
  );

  return { data, error, fetchedAt, load, run };
}

export type Run = ReturnType<typeof usePlanner>["run"];
