// The snooze setting: the longest snooze, and the ready-made intervals (in
// days) the snooze menu offers, in the order the user chose. The server holds
// the same defaults (internal/db/snooze.go) and checks what is saved.

export const DEFAULT_SNOOZE_MAX = 60;
export const DEFAULT_SNOOZE_INTERVALS = [1, 2, 3, 7, 14, 30];
export const MAX_SNOOZE_INTERVALS = 16;

interface SnoozeSetting {
  max_days?: number;
  intervals?: number[];
}

/** The cap from Settings → Snooze. */
export function snoozeMaxDays(settings: Record<string, unknown>): number {
  return (settings.snooze as SnoozeSetting | undefined)?.max_days ?? DEFAULT_SNOOZE_MAX;
}

/** The menu's intervals, in the user's order, cut to the cap. */
export function snoozeIntervals(settings: Record<string, unknown>): number[] {
  const s = settings.snooze as SnoozeSetting | undefined;
  const max = snoozeMaxDays(settings);
  return (s?.intervals ?? DEFAULT_SNOOZE_INTERVALS).filter((n) => n >= 1 && n <= max);
}

/** "Tomorrow", "1 week", "2 months", "10 days". */
export function intervalLabel(n: number): string {
  if (n === 1) return "Tomorrow";
  if (n % 30 === 0 && n <= 360) return n === 30 ? "1 month" : `${n / 30} months`;
  if (n % 7 === 0 && n < 30) return n === 7 ? "1 week" : `${n / 7} weeks`;
  return `${n} days`;
}

/** The days from one date to another (both YYYY-MM-DD). */
export function daysUntil(from: string, to: string): number {
  const f = from.split("-").map(Number);
  const t = to.split("-").map(Number);
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86400000);
}
