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

export interface DayData {
  day: string;
  plan: {
    saved: boolean;
    focus: string[];
    ceilings: Record<string, number>;
    note: string | null;
    ceiling_feedback: Feedback | null;
  };
  suggested: {
    focus: string[];
    ceilings: Record<string, number>;
    held: Record<string, { since: string; day: number; from: number }>;
  };
  readout: { energy_type_id: number; name: string; planned: number | null; spent: number; over: boolean }[];
  spend: { energy_type_id: number; name: string; hours: number }[];
  restore: { energy_type_id: number; name: string; hours: number }[];
  in_force: StateRow[];
  sessions: Session[];
}

/** "1.4 (from 4)" when decay has moved it, else "4". Display only. */
export function severityText(s: Pick<StateRow, "severity" | "effective_severity">): string {
  const r = (v: number) => String(Math.round(v * 10) / 10);
  return r(s.effective_severity) === r(s.severity) ? r(s.severity) : `${r(s.effective_severity)} (from ${r(s.severity)})`;
}
