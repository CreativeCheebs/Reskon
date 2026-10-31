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

/** Hours as "3h 2m", "45m" or "12h". */
export function formatHM(h: number | null | undefined): string {
  if (h === null || h === undefined) return "–";
  const mins = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  const s = hh && mm ? `${hh}h ${mm}m` : hh ? `${hh}h` : `${mm}m`;
  return h < 0 ? `-${s}` : s;
}

/** A stretch of time as its two largest units: "3d 3h", "5h 20m", "12m". */
export function formatSpan(h: number | null | undefined): string {
  if (h === null || h === undefined) return "–";
  const mins = Math.max(0, Math.round(h * 60));
  const d = Math.floor(mins / 1440);
  const hh = Math.floor((mins % 1440) / 60);
  const mm = mins % 60;
  if (d) return hh ? `${d}d ${hh}h` : `${d}d`;
  if (hh) return mm ? `${hh}h ${mm}m` : `${hh}h`;
  return `${mm}m`;
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
