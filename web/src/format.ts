// Display formatting only. No derivation happens here: every number shown
// was computed by the server.

export function formatAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "–";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "–";
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Today's local date as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
