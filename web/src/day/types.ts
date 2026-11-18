import type { Session } from "../types";

// GET /api/day/:date. Every figure is computed by the server.

export interface StateRow {
  id: number;
  name: string;
  kind: "buff" | "debuff" | "modifier";
  severity: number;
  started_on: string;
  duration_days: number | null;
  decay: "static" | "linear" | "fast" | "slow";
  cleared_on: string | null;
  note: string | null;
  effective_on: string;
  effective_severity: number;
  in_force: boolean;
  days_running: number;
  ended: boolean;
}

export type Feedback = "about_right" | "too_high" | "too_low";

export interface DayItem {
  id: number;
  day: string;
  kind: "task" | "event";
  task_id: number | null;
  title: string;
  area_id: number | null;
  position: number;
  /** Minutes planned on this day (an event's reserved time, or a task line's own plan); null = not set. */
  planned_min: number | null;
  /** Task lines: the linked task's own title, and whether this line carries its own name. */
  task_title: string | null;
  renamed: boolean;
  /** Tasks only: the one whole-task estimate, and hours logged in all time and on this day. */
  estimate_h: number | null;
  logged_h: number;
  logged_day_h: number;
  status_id: number | null;
  status_behaviour: "todo" | "in_progress" | "done" | "cancelled" | null;
  /** The line is ticked, or its task is done or cancelled. */
  done: boolean;
  /** The task's own status is done or cancelled (task lines). */
  task_done: boolean;
  /** Minutes logged on this line today. */
  logged_line_min: number;
  reserved_min: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlanTotals {
  planned_min: number;
  logged_min: number;
  unestimated: number;
  available_min: number | null;
  available_from: "day" | "weekday" | null;
  over: boolean;
  reserved_min: number;
  unplanned_logged_min: number;
  /** Available minus what is still to do; null when available is not set; below 0 when over. */
  free_min: number | null;
}

export interface TimerRow {
  id: number;
  day: string;
  kind: "task" | "event";
  task_id: number | null;
  day_item_id: number | null;
  title: string;
  started_at: string;
  resumed_at: string | null;
  accumulated_s: number;
  elapsed_s: number;
  running: boolean;
  /** Stopped, not yet saved or discarded: its time waits for review. */
  stopped: boolean;
  /** Set once stopped: the session to review. */
  draft: TimerDraft | null;
}

export interface TimerList {
  timers: TimerRow[];
  conflict: boolean;
}

/** What Stop hands back: a session to review, not yet saved. */
export interface TimerDraft {
  kind: "task" | "event";
  task_id?: number;
  day_item_id?: number;
  label?: string;
  logged_for: string;
  hours: number;
  started_at: string;
  ended_at: string;
}

export interface BringCandidate {
  task_id: number;
  title: string;
  area_id: number;
  estimate_h: number | null;
  logged_h: number;
  from_day: string;
  days: number;
}

export interface DayData {
  day: string;
  plan: {
    saved: boolean;
    focus: string[];
    ceilings: Record<string, number>;
    note: string | null;
    /** The day's own available minutes, or null to use the weekday's. */
    available_min?: number | null;
    /** energy type id -> answer, for types that had a ceiling */
    ceiling_feedback: Record<string, Feedback>;
  };
  suggested: {
    focus: string[];
    ceilings: Record<string, number>;
    held: Record<string, { since: string; day: number; from: number }>;
  };
  readout: { energy_type_id: number; name: string; planned: number | null; spent: number; over: boolean }[];
  totals: { energy_type_id: number; name: string; hours: number }[];
  in_force: StateRow[];
  sessions: Session[];
  items: DayItem[];
  plan_totals: PlanTotals;
  timers: TimerList;
}

/** "1.4 (from 4)" when decay has moved it, else "4". Display only. */
export function severityText(s: Pick<StateRow, "severity" | "effective_severity">): string {
  const r = (v: number) => String(Math.round(v * 10) / 10);
  return r(s.effective_severity) === r(s.severity) ? r(s.severity) : `${r(s.effective_severity)} (from ${r(s.severity)})`;
}
