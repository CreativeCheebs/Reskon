import { WarningFilled } from "@ant-design/icons";
import { Tooltip } from "antd";
import { formatHM } from "../format";
import { Chip } from "../theme/Chip";
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
  // Over the estimate: the bar turns red, a warning sign appears, and the
  // logged time and "+4h over" are red too, so an overrun never looks like
  // a bar that is simply full.
  // Finished within the estimate: the bar is full (green for done, grey for
  // cancelled) and says how much under it came in, so a finished card never
  // looks half done.
  const cancelled = task.behaviour === "cancelled";
  const fill = over ? palette.danger : done ? (cancelled ? palette.subtle : palette.success) : palette.accent;
  const width = done && !over ? 100 : Math.min(100, task.progress_pct);
  const ended = cancelled ? "cancelled" : "done";
  const left = over
    ? `+${formatHM(-task.remaining_h)} over`
    : done
      ? task.remaining_h > 0 ? `${ended}, ${formatHM(task.remaining_h)} under` : ended
      : `${formatHM(task.remaining_h)} left`;
  const big = size === "panel";
  const paceLine = pace && !done ? <PaceLine task={task} /> : null;
  const bar = (
    <Tooltip
      title={`${formatHM(task.logged_h)} logged of a ${formatHM(task.estimate_h)} estimate · ${left}${over ? ` (${Math.round(task.progress_pct)}% of the estimate)` : ""}`}
      mouseEnterDelay={0.4}
    >
      <div
        role="meter"
        aria-label="Time logged against the estimate"
        aria-valuemin={0}
        aria-valuemax={task.estimate_h}
        aria-valuenow={task.logged_h}
        aria-valuetext={`${formatHM(task.logged_h)} of ${formatHM(task.estimate_h)}, ${left}`}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, lineHeight: "16px" }}
      >
        <div style={{ flex: 1, minWidth: 40, height: big ? 6 : 4, borderRadius: 3, background: palette.border, overflow: "hidden" }}>
          <div style={{ width: `${width}%`, height: "100%", background: fill, borderRadius: 3 }} />
        </div>
        <span style={{ flex: "none", whiteSpace: "nowrap", color: palette.muted }}>
          {over && <WarningFilled aria-hidden style={{ color: palette.danger, marginRight: 4 }} />}
          <span style={{ color: over ? palette.danger : palette.fg, fontWeight: 500 }}>{formatHM(task.logged_h)}</span> / {formatHM(task.estimate_h)}
          <span style={{ color: over ? palette.danger : palette.subtle, fontWeight: over ? 600 : undefined }}> · {left}</span>
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
  const style = { fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" };
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

/** The pace as a chip, for board cards: it sits in the chip row, so it
 *  never adds a line of its own and cards keep an even rhythm. Overdue says
 *  nothing here, since the card's own "Overdue" chip already does. */
export function paceChip(task: Task): React.ReactNode {
  const days = task.days_to_due;
  if (days === null || days < 0 || task.remaining_h === null || task.remaining_h <= 0) return null;
  if (task.behaviour === "done" || task.behaviour === "cancelled") return null;
  if (days === 0)
    return (
      <Chip key="pace" color={palette.warn} tip={`Due today · ${formatHM(task.remaining_h)} still to do`}>
        {formatHM(task.remaining_h)} to do today
      </Chip>
    );
  const when = dueWhen(days, task.due_at!);
  return (
    <Chip key="pace" tip={`About ${formatHM(task.pace_h)} a day to finish ${when}`}>
      ≈ {formatHM(task.pace_h)}/day {when}
    </Chip>
  );
}

function dueWhen(days: number, due: string): string {
  if (days === 1) return "by tomorrow";
  const d = new Date(due + "T00:00:00");
  if (days < 7) return "by " + d.toLocaleDateString(undefined, { weekday: "short" });
  return "by " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
