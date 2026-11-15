import { WarningOutlined } from "@ant-design/icons";
import { palette } from "../theme/palette";
import type { MetricResult } from "./types";

// Under an app data widget: when the app made the data, and, when the app
// could not be asked just now, that this is Reskon's kept copy and why. The
// note is words and an icon, never colour alone.

/** "14:05" today, "12 Nov, 14:05" another day. */
export function fetchedTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

export function AppDataNote({ res }: { res: MetricResult }) {
  // A time that cannot be read is left out rather than shown as nothing.
  const when = res.fetched_at ? fetchedTime(res.fetched_at) : "";
  if (res.stale) {
    return (
      <div role="status" style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6, fontSize: 12, color: palette.fg }}>
        <WarningOutlined aria-hidden style={{ color: palette.warn }} />
        <span>
          {when ? `Showing the copy from ${when}` : "Showing the kept copy"}
          {res.stale_reason ? `: ${res.stale_reason}` : ""}
        </span>
      </div>
    );
  }
  if (!when) return null;
  return <div style={{ marginTop: 6, fontSize: 11, color: palette.subtle }}>fetched {when}</div>;
}
