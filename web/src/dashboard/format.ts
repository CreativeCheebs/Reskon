import { formatAge } from "../format";
import { palette } from "../theme/palette";
import type { MetricResult } from "./types";

// Display only: units and labels for numbers the server computed.

/** Ages (time in status, cycle time) read best in days once long; summed
 *  hours stay hours, since "12d" of rest would read as twelve days. */
const AGE_METRICS = ["time_in_status", "cycle_time"];

export function formatValue(v: number, unit: string, metric = ""): string {
  switch (unit) {
    case "hours":
      return AGE_METRICS.includes(metric) && v >= 48 ? formatAge(v) : `${round(v)}h`;
    case "ratio":
      return `${Math.round(v * 100)}%`;
    case "days":
      return `${round(v)} ${v === 1 ? "day" : "days"}`;
    default:
      return String(round(v));
  }
}

/** A number an app sent, with its unit exactly as the app wrote it
 *  ("12 days", "3 glasses"): Reskon's own units are not applied to it. */
export function appValue(v: number, unit = ""): string {
  return unit ? `${round(v)} ${unit}` : String(round(v));
}

/** A value of a result: an app's with its own unit, a metric's formatted. */
export function resultValue(v: number, res: MetricResult): string {
  return res.shape ? appValue(v, res.unit) : formatValue(v, res.unit, res.metric);
}

/** A share from the server (0..1) as a whole percent. */
export function formatShare(share: number | undefined): string {
  return share === undefined ? "" : `${Math.round(share * 100)}%`;
}

const round = (v: number) => (Number.isInteger(v) ? v : Number(v.toFixed(1)));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A group key as shown on an axis: "29 Oct", "Oct 2026", or the label. */
export function keyLabel(res: MetricResult, key: string, label: string, long = false): string {
  if (res.group === "day" || res.group === "week") {
    const [y, m, d] = key.split("-").map(Number);
    if (!y || !m || !d) return label;
    const day = new Date(y, m - 1, d);
    const base = `${d} ${MONTHS[m - 1]}`;
    if (res.group === "week") return long ? `week of ${base}` : base;
    return long ? `${DAYS[day.getDay()]} ${base}` : base;
  }
  if (res.group === "month") {
    const [y, m] = key.split("-").map(Number);
    return m ? `${MONTHS[m - 1]} ${y}` : label;
  }
  return label;
}

/** A widget's colour option: a palette name or #rrggbb. */
export function optionColor(c: string | undefined, fallback = palette.accent): string {
  if (!c) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return (palette as Record<string, string>)[c] ?? fallback;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** One colour per split series: the one the widget saved for it (options.series_colors,
 *  by the series' key), else its own (an area's or energy type's) when it has
 *  one no earlier series took, else the next from a fixed cycle. */
export function seriesColors(series: { key?: string; color: string | null }[], chosen?: Record<string, string>): string[] {
  const cycle = [palette.accent, palette.success, palette.warn, palette.epic, palette.danger, palette.muted];
  const picked = (s: { key?: string }) => {
    const own = s.key !== undefined ? chosen?.[s.key] : undefined;
    return own && HEX.test(own) ? own : "";
  };
  const used = new Set<string>(series.map(picked).filter(Boolean).map((c) => c.toLowerCase()));
  let next = 0;
  return series.map((s) => {
    if (picked(s)) return picked(s);
    let c = s.color && /^#[0-9a-fA-F]{6}$/.test(s.color) && !used.has(s.color.toLowerCase()) ? s.color : "";
    while (!c) {
      const candidate = cycle[next++ % cycle.length];
      if (!used.has(candidate.toLowerCase()) || next > cycle.length * 2) c = candidate;
    }
    used.add(c.toLowerCase());
    return c;
  });
}
