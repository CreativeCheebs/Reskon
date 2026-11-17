import type { WidgetQuery } from "./types";

// A chart widget's period: one of the server's named ranges, or "custom",
// meaning the widget saves its own from and to dates. The server runs the
// dates (a query with from and to ignores any range), so this only keeps
// the two ways of choosing from being saved together.

export const CUSTOM_RANGE = "custom";

/** What the Range select shows: "custom" when the query holds its own dates. */
export function rangeChoice(q: WidgetQuery): string {
  return q.from && q.to ? CUSTOM_RANGE : (q.range ?? "30d");
}

function without(q: WidgetQuery, ...keys: (keyof WidgetQuery)[]): WidgetQuery {
  const out = { ...q };
  for (const k of keys) delete out[k];
  return out;
}

/** The query after the person picks a range from the select. Choosing
 *  Custom starts on the last seven days up to today. */
export function withRangeChoice(q: WidgetQuery, choice: string, today: string): WidgetQuery {
  if (choice !== CUSTOM_RANGE) return { ...without(q, "from", "to"), range: choice };
  return { ...without(q, "range"), from: addDays(today, -6), to: today };
}

/** The query after the person picks two dates (kept in order). */
export function withDates(q: WidgetQuery, a: string, b: string): WidgetQuery {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return { ...without(q, "range"), from, to };
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
