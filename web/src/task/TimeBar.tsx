import { Tooltip } from "antd";
import { formatHM } from "../format";
import { palette } from "../theme/palette";
import type { Task } from "../types";

// Time logged against the estimate, as a thin bar with "3h 2m of 12h" and
// what is left beside it, so the deadline in hours stays in view. With a
// due date (and pace on), a line under it says what a day it takes to
// finish in time. Every number comes from the server (logged_h,
// progress_pct, remaining_h, days_to_due, pace_h).

export function TimeBar({ task, size = "card", pace = true }: { task: Task; size?: "card" | "panel"; pace?: boolean }) {
  if (task.progress_pct === null || task.estimate_h === null || task.remaining_h === null) return null;
  const over = task.remaining_h < 0;
  const done = task.behaviour === "done" || task.behaviour === "cancelled";
  const fill = over ? palette.warn : palette.accent;
  const left = over ? `${formatHM(-task.remaining_h)} over` : `${formatHM(task.remaining_h)} left`;
  const big = size === "panel";
  const paceLine = pace && !done ? <PaceLine task={task} /> : null;
  const bar = (
    <Tooltip
      title={`${formatHM(task.logged_h)} logged of a ${formatHM(task.estimate_h)} estimate · ${left}`}
      mouseEnterDelay={0.4}
    >
      <div
        role="meter"
        aria-label="Time logged against the estimate"
        aria-valuemin={0}
        aria-valuemax={task.estimate_h}
        aria-valuenow={task.logged_h}
        aria-valuetext={`${formatHM(task.logged_h)} of ${formatHM(task.estimate_h)}, ${left}`}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: big ? 12 : 11, lineHeight: "16px" }}
      >
        <div style={{ flex: 1, minWidth: 40, height: big ? 6 : 4, borderRadius: 3, background: palette.border, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, task.progress_pct)}%`, height: "100%", background: fill, borderRadius: 3 }} />
        </div>
        <span style={{ flex: "none", whiteSpace: "nowrap", color: palette.muted }}>
          <span style={{ color: palette.fg, fontWeight: 500 }}>{formatHM(task.logged_h)}</span> / {formatHM(task.estimate_h)}
          {!done && <span style={{ color: over ? palette.warn : palette.subtle }}> · {left}</span>}
        </span>
      </div>
    </Tooltip>
  );
  if (!paceLine) return bar;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {bar}
      {paceLine}
    </div>
  );
}

/** "≈3h a day to finish by Mon" or "Overdue 2 days"; nothing without a due date. */
function PaceLine({ task }: { task: Task }) {
  const days = task.days_to_due;
  if (days === null || task.remaining_h === null || task.remaining_h <= 0) return null;
  const style = { fontSize: 11, lineHeight: "15px", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" };
  if (days < 0)
    return (
      <span style={{ ...style, color: palette.warn }}>
        Overdue {-days} day{days === -1 ? "" : "s"} · {formatHM(task.remaining_h)} still to do
      </span>
    );
  if (days === 0)
    return (
      <span style={{ ...style, color: palette.warn }} title={`Due ${task.due_at}`}>
        Due today · {formatHM(task.remaining_h)} to do
      </span>
    );
  return (
    <span style={{ ...style, color: palette.muted }} title={`Due ${task.due_at}`}>
      ≈ <span style={{ color: palette.fg, fontWeight: 500 }}>{formatHM(task.pace_h)}</span> a day to finish {dueWhen(days, task.due_at!)}
    </span>
  );
}

function dueWhen(days: number, due: string): string {
  if (days === 1) return "by tomorrow";
  const d = new Date(due + "T00:00:00");
  if (days < 7) return "by " + d.toLocaleDateString(undefined, { weekday: "short" });
  return "by " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
