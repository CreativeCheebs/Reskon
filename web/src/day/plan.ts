import { formatHM } from "../format";
import type { DayItem, PlanTotals, TimerRow } from "./types";

// Display helpers for the Day Planner. Nothing here works out a figure the
// server owns (planned, logged, over, elapsed at fetch time): it only words
// them, orders rows and ticks a running timer on from the time it was read.

/** Minutes as "1h 30m", "45m", "2h". */
export function minutesText(min: number | null | undefined): string {
  if (min === null || min === undefined) return "–";
  return formatHM(min / 60);
}

/** The totals line: planned against available, with no warning when none is set. */
export function availableText(t: PlanTotals): string {
  if (t.available_min === null) return "Available time not set";
  const from = t.available_from === "day" ? "set for this day" : "from the weekday";
  return `${minutesText(t.available_min)} available (${from})`;
}

/** "3 tasks have no estimate" or "". */
export function unestimatedText(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "1 task has no estimate" : `${n} tasks have no estimate`;
}

/** The task row's all-time figures: "35m / 3h" or "35m / no estimate". Not the day's totals. */
export function loggedOfEstimate(item: Pick<DayItem, "logged_h" | "estimate_h">): string {
  const est = item.estimate_h === null ? "no estimate" : formatHM(item.estimate_h);
  return `${formatHM(item.logged_h)} / ${est}`;
}

/** What the row's right-hand side says: a task's logged / estimate, an event's reserved minutes. */
export function rowFigures(item: DayItem): string {
  if (item.kind === "event") return item.planned_min === null ? "–" : `${minutesText(item.planned_min)} reserved`;
  return loggedOfEstimate(item);
}

/** Seconds as "12:03" or "1:02:03". */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * A timer's elapsed seconds now: the server's figure when it was fetched,
 * plus the time passed on this device since, only while it runs.
 */
export function elapsedNow(t: Pick<TimerRow, "elapsed_s" | "running">, fetchedAtMs: number, nowMs: number): number {
  return t.elapsed_s + (t.running ? Math.max(0, (nowMs - fetchedAtMs) / 1000) : 0);
}

/** Ids in a new order: the moved id placed before `beforeId` (or last when null). */
export function reorderIds(ids: number[], moved: number, beforeId: number | null): number[] {
  const rest = ids.filter((i) => i !== moved);
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId);
  rest.splice(at < 0 ? rest.length : at, 0, moved);
  return rest;
}

/** Move one id a step up (-1) or down (+1); unchanged at the ends. */
export function stepIds(ids: number[], id: number, step: -1 | 1): number[] {
  const i = ids.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export const WEEKDAYS = [
  ["sun", "Sunday"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
] as const;

/** The planner_available setting as it is saved: only weekdays that are set, in minutes. */
export function readAvailable(setting: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!setting || typeof setting !== "object") return out;
  for (const [k] of WEEKDAYS) {
    const v = (setting as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Parses "90", "1h 30m", "1:30" typed as minutes; null when unreadable or not positive. */
export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) > 0 ? Number(t) : null;
  const colon = /^(\d+):([0-5]?\d)$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]) || null;
  const m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/.exec(t);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const total = Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  return total > 0 ? total : null;
}
