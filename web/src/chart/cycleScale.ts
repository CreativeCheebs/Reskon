import { blend, palette } from "../theme/palette";
import type { Status } from "../types";

// Display helpers for the cycle-time chart: one unit for the whole chart,
// round-numbered axis ticks, and status colours that stay told apart.

export type Unit = "h" | "d";

/** Days once the longest figure passes two days, else hours. */
export const unitFor = (maxH: number): Unit => (maxH >= 48 ? "d" : "h");

export const unitName = (u: Unit) => (u === "d" ? "days" : "hours");

/** Hours in the chart's unit: one decimal under 10, whole numbers above. */
export function formatSpan(hours: number, unit: Unit): string {
  const v = unit === "d" ? hours / 24 : hours;
  if (v === 0) return `0${unit}`;
  if (v < 0.1) return `<0.1${unit}`;
  if (v < 10) return `${v.toFixed(1)}${unit}`;
  return `${Math.round(v).toLocaleString()}${unit}`;
}

/** Round tick values (in hours) from 0 up to max, about `target` of them. */
export function ticks(maxH: number, unit: Unit, target: number): number[] {
  const per = unit === "d" ? 24 : 1;
  const max = maxH / per;
  if (max <= 0) return [0];
  const rough = max / Math.max(target, 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v * per);
  return out;
}

/** Each status's own colour, except that a status whose colour is already
 *  taken gets the lighter or darker shade of it that stands furthest from
 *  every other colour on the chart, so neighbouring segments differ. The
 *  first of a group (by board order) keeps the exact colour. */
export function chartColors(ids: number[], statusById: Map<number, Status>): Map<number, string> {
  const ordered = [...ids].sort((a, b) => (statusById.get(a)?.position ?? 1e9) - (statusById.get(b)?.position ?? 1e9));
  const baseOf = (id: number) => (statusById.get(id)?.color ?? palette.borderStrong).toUpperCase();
  // Every colour some status keeps as-is is taken before any shade is
  // chosen, so a shade keeps clear of statuses later in the order too. The
  // page background counts as taken, so no shade sinks into it.
  const taken = [...new Set(ordered.map(baseOf)), palette.bg.toUpperCase()];
  const kept = new Set<string>();
  const out = new Map<number, string>();
  for (const id of ordered) {
    const base = baseOf(id);
    if (!kept.has(base)) {
      kept.add(base);
      out.set(id, base);
      continue;
    }
    const shades = [0.2, 0.35, 0.5].flatMap((t) => [blend("#000000", base, t), blend("#FFFFFF", base, t)]);
    const pick = shades.reduce((best, c) => (nearest(c, taken) > nearest(best, taken) ? c : best));
    taken.push(pick.toUpperCase());
    out.set(id, pick);
  }
  return out;
}

/** Distance from a colour to the closest of others, in plain RGB. */
function nearest(c: string, others: string[]): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(c);
  return Math.min(...others.map((o) => Math.hypot(...rgb(o).map((v, i) => v - a[i]))));
}
