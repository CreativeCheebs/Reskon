import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { formatHours, today } from "../format";
import { intervalLabel } from "./snoozeIntervals";

// What the snooze menu shows beside each choice: the hours (estimates) and
// points of snoozed tasks already coming back on that date. The server works
// the numbers out (GET /api/snooze/forecast); this file only asks for them
// and writes them down. Loading or a failed call just leaves the numbers
// out: the menu always works.

export interface DayForecast {
  date: string;
  hours: number;
  points: number;
}

export interface ForecastState {
  status: "idle" | "loading" | "ready" | "error";
  days: Record<string, DayForecast>;
}

const IDLE: ForecastState = { status: "idle", days: {} };

/** The local date n days from today, YYYY-MM-DD. */
export function daysFromToday(n: number): string {
  const [y, m, d] = today().split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** "Wed 5 Nov" for a local YYYY-MM-DD date. */
export function formatWakeDate(day: string): string {
  return new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Asks the server about these dates while enabled (the menu is open).
 *  excludeId is the task being snoozed. delayMs waits a moment first, for a
 *  date that changes as someone types. */
export function useSnoozeForecast(dates: string[], excludeId: number, enabled: boolean, delayMs = 0): ForecastState {
  const [state, setState] = useState<ForecastState>(IDLE);
  const key = dates.join(",");
  useEffect(() => {
    if (!enabled || !key) {
      setState(IDLE);
      return;
    }
    let live = true;
    setState({ status: "loading", days: {} });
    const go = () =>
      api
        .get<DayForecast[]>(`/snooze/forecast?dates=${key}&exclude=${excludeId}`)
        .then((rows) => live && setState({ status: "ready", days: Object.fromEntries(rows.map((r) => [r.date, r])) }))
        .catch(() => live && setState({ status: "error", days: {} }));
    const timer = setTimeout(go, delayMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, excludeId, enabled, delayMs]);
  return state;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The two numbers for a date: null while they are not known. A dash text
 *  stands for nothing coming back. */
export function forecastFor(state: ForecastState, date: string): { hours: string; points: string; zero: boolean } | null {
  if (state.status !== "ready") return null;
  const d = state.days[date];
  if (!d || (d.hours === 0 && d.points === 0)) return { hours: "–", points: "–", zero: true };
  return { hours: formatHours(d.hours), points: num(d.points), zero: false };
}

/** One line for the date picker: "Mon 7 Dec: 2h, 5 pts". Just the date while
 *  the numbers are not known. */
export function forecastSentence(state: ForecastState, date: string): string {
  const f = forecastFor(state, date);
  const when = formatWakeDate(date);
  if (!f) return when;
  return f.zero ? `${when}: nothing coming back` : `${when}: ${f.hours}, ${f.points} pts`;
}

/** The header over the choices. */
export function SnoozeHead() {
  return (
    <div className="jb-snooze-grid jb-snooze-head" aria-hidden>
      <span>Snooze until</span>
      <span>Hours</span>
      <span>Points</span>
    </div>
  );
}

/** The inside of one choice: its name with the date under it, then hours and
 *  points (dashes when nothing comes back, empty while not known). */
export function SnoozeRowBody({ days, state }: { days: number; state: ForecastState }) {
  const date = daysFromToday(days);
  const f = forecastFor(state, date);
  const cell = (text: string | undefined): ReactNode => (
    <span className={`jb-snooze-num${f?.zero ? " jb-snooze-zero" : ""}`}>{text}</span>
  );
  return (
    <span className="jb-snooze-grid">
      <span className="jb-snooze-when">
        {intervalLabel(days)}
        <span className="jb-snooze-date">{formatWakeDate(date)}</span>
      </span>
      {cell(f?.hours)}
      {cell(f?.points)}
    </span>
  );
}
