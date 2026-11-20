import { useEffect, useMemo, useRef } from "react";
import { Segmented, Typography } from "antd";
import { useApp } from "../store";
import { useEpics } from "../task/useEpics";
import { blend, palette } from "../theme/palette";
import { today } from "../format";
import type { Task } from "../types";
import { titleText } from "../task/RoundTag";
import { pressable } from "../a11y";
import { useTerms } from "../terms";

// A simple timeline, after Jira's: one row per task with a bar from its
// start date to its end date, grouped under epics. Read-only; dates are
// set in the task panel. A task with only one of its dates (or only a due
// date) gets a one-day bar there; a task with none is counted, not drawn.

export type TimelineZoom = "weeks" | "months" | "quarters";

const DAY_PX: Record<TimelineZoom, number> = { weeks: 32, months: 10, quarters: 4 };
const ROW = 30;
const LABELS = 280;
const DAY_MS = 86_400_000;

/** Days since the epoch for a local YYYY-MM-DD date. */
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const dateOf = (n: number) => new Date(n * DAY_MS);

interface Span {
  task: Task;
  from: number;
  to: number;
}

/** Where a task sits, or null when it has no dates at all. */
function spanOf(t: Task): Span | null {
  const start = t.start_date;
  const end = t.end_date ?? t.due_at;
  if (!start && !end) return null;
  const from = dayNum(start ?? end!);
  const to = Math.max(from, dayNum(end ?? start!));
  return { task: t, from, to };
}

interface Group {
  key: string;
  title: string | null; // null: tasks with no epic
  epic?: Task;
  rows: Span[];
}

interface Props {
  tasks: Task[];
  zoom: TimelineZoom;
  onZoom: (z: TimelineZoom) => void;
  onOpenTask: (id: number) => void;
}

export function Timeline({ tasks, zoom, onZoom, onOpenTask }: Props) {
  const { statusById } = useApp();
  const T = useTerms();
  const { byId: epicsById } = useEpics();
  const scroller = useRef<HTMLDivElement>(null);
  const px = DAY_PX[zoom];
  const now = dayNum(today());

  const { groups, unscheduled, first, last } = useMemo(() => {
    const byEpic = new Map<string, Group>();
    const group = (key: string, title: string | null, epic?: Task) => {
      if (!byEpic.has(key)) byEpic.set(key, { key, title, epic, rows: [] });
      return byEpic.get(key)!;
    };
    let unscheduled = 0;
    let first = now - 14;
    let last = now + 30;
    for (const t of tasks) {
      if (t.type === "epic") {
        const g = group(`e${t.id}`, t.title, t);
        g.epic = t;
        continue;
      }
      const s = spanOf(t);
      if (!s) {
        unscheduled++;
        continue;
      }
      first = Math.min(first, s.from - 7);
      last = Math.max(last, s.to + 14);
      const epic = t.epic_id ? epicsById.get(t.epic_id) : undefined;
      (epic ? group(`e${epic.id}`, epic.title, epic) : group("none", null)).rows.push(s);
    }
    // Epics with nothing scheduled under them are left out; their own
    // dates, if any, still draw on the epic's row.
    const groups = [...byEpic.values()]
      .filter((g) => g.rows.length > 0 || (g.epic && spanOf(g.epic)))
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.from - b.from || a.to - b.to) }))
      .sort((a, b) => (a.title === null ? 1 : b.title === null ? -1 : (a.rows[0]?.from ?? Infinity) - (b.rows[0]?.from ?? Infinity)));
    for (const g of groups) {
      const s = g.epic && spanOf(g.epic);
      if (s) {
        first = Math.min(first, s.from - 7);
        last = Math.max(last, s.to + 14);
      }
    }
    return { groups, unscheduled, first, last };
  }, [tasks, epicsById, now]);

  const width = (last - first + 1) * px;
  const x = (day: number) => (day - first) * px;

  // Start with today near the left edge.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, x(now) - 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, first]);

  // Header ticks: month starts always; week starts (Mondays) or days when zoomed in.
  const months: { day: number; label: string }[] = [];
  const ticks: { day: number; label: string }[] = [];
  for (let d = first; d <= last; d++) {
    const date = dateOf(d);
    if (date.getUTCDate() === 1 || d === first)
      months.push({ day: d, label: date.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }) });
    if (zoom === "weeks") ticks.push({ day: d, label: String(date.getUTCDate()) });
    else if (zoom === "months" && date.getUTCDay() === 1) ticks.push({ day: d, label: String(date.getUTCDate()) });
  }

  const rows: { kind: "epic" | "task" | "none"; group: Group; span?: Span }[] = [];
  for (const g of groups) {
    rows.push({ kind: g.title === null ? "none" : "epic", group: g });
    for (const s of g.rows) rows.push({ kind: "task", group: g, span: s });
  }

  const bar = (s: Span, epic: boolean) => {
    const status = statusById.get(s.task.status_id);
    const finished = s.task.behaviour === "done" || s.task.behaviour === "cancelled";
    const color = epic ? palette.epic : status?.color || palette.accent;
    const w = (s.to - s.from + 1) * px;
    return (
      <div
        className="jb-clickable"
        {...pressable(() => onOpenTask(s.task.id), titleText(s.task))}
        title={`${titleText(s.task)} · ${dateOf(s.from).toISOString().slice(0, 10)} → ${dateOf(s.to).toISOString().slice(0, 10)}${status ? ` · ${status.name}` : ""}`}
        style={{
          position: "absolute",
          left: x(s.from) + 1,
          width: Math.max(w - 2, 6),
          top: epic ? 9 : 6,
          height: epic ? 12 : 18,
          borderRadius: 4,
          background: finished ? blend(color, palette.bg, 0.35) : blend(color, palette.bg, 0.8),
          border: `1px solid ${color}`,
          color: palette.fg,
          fontSize: 11,
          lineHeight: "16px",
          padding: "0 6px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          boxSizing: "border-box",
        }}
      >
        {!epic && w > 60 ? titleText(s.task) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Segmented
          size="small"
          className="jb-seg"
          aria-label="Timeline zoom"
          value={zoom}
          onChange={(v) => onZoom(v as TimelineZoom)}
          options={[
            { value: "weeks", label: "Weeks" },
            { value: "months", label: "Months" },
            { value: "quarters", label: "Quarters" },
          ]}
        />
        {unscheduled > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {unscheduled} {unscheduled === 1 ? `${T.task} has` : `${T.tasks} have`} no start, end or due date and {unscheduled === 1 ? "isn't" : "aren't"} shown
          </Typography.Text>
        )}
      </div>
      <div ref={scroller} style={{ flex: 1, minHeight: 0, overflow: "auto", border: `1px solid ${palette.border}`, borderRadius: 8, background: palette.bg }}>
        <div style={{ position: "relative", width: LABELS + width, minHeight: "100%" }}>
          {/* Header: months over ticks, sticky at the top. */}
          <div style={{ position: "sticky", top: 0, zIndex: 3, display: "flex", height: 44, background: palette.panel, borderBottom: `1px solid ${palette.border}` }}>
            <div style={{ position: "sticky", left: 0, zIndex: 4, width: LABELS, flex: "none", background: palette.panel, borderRight: `1px solid ${palette.border}` }} />
            <div style={{ position: "relative", width, flex: "none" }}>
              {months.map((m) => (
                <span key={m.day} style={{ position: "absolute", left: x(m.day) + 4, top: 4, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", color: palette.fg }}>
                  {m.label}
                </span>
              ))}
              {ticks.map((t) => (
                <span key={t.day} style={{ position: "absolute", left: x(t.day), width: px, top: 24, fontSize: 11, textAlign: zoom === "weeks" ? "center" : "left", color: t.day === now ? palette.accent : palette.muted }}>
                  {t.label}
                </span>
              ))}
            </div>
          </div>
          {rows.length === 0 && (
            <div style={{ position: "sticky", left: 0, width: LABELS + 400, padding: 24, color: palette.muted }}>
              Nothing to draw yet. Give {T.tasks} a start and end date in their panel.
            </div>
          )}
          {rows.map((r, i) => {
            const label =
              r.kind === "task" ? titleText(r.span!.task) : r.kind === "epic" ? r.group.title : `No ${T.epic}`;
            const epicSpan = r.kind === "epic" && r.group.epic ? spanOf(r.group.epic) : null;
            return (
              <div key={r.kind === "task" ? `t${r.span!.task.id}` : `g${r.group.key}`} style={{ display: "flex", height: ROW, borderTop: i ? `1px solid ${blend(palette.border, palette.bg, 0.5)}` : undefined }}>
                <div
                  className={r.kind === "none" ? undefined : "jb-clickable"}
                  {...pressable(
                    r.kind === "none" ? undefined : () => (r.kind === "task" ? onOpenTask(r.span!.task.id) : r.group.epic && onOpenTask(r.group.epic.id)),
                    label ?? undefined,
                  )}
                  title={label ?? undefined}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    width: LABELS,
                    flex: "none",
                    background: palette.bg,
                    borderRight: `1px solid ${palette.border}`,
                    padding: r.kind === "task" ? "0 10px 0 24px" : "0 10px",
                    lineHeight: `${ROW}px`,
                    fontSize: 13,
                    fontWeight: r.kind === "task" ? 400 : 600,
                    color: r.kind === "epic" ? palette.epic : r.kind === "none" ? palette.muted : palette.fg,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </div>
                <div style={{ position: "relative", width, flex: "none" }}>
                  {r.kind === "task" && bar(r.span!, false)}
                  {epicSpan && bar(epicSpan, true)}
                </div>
              </div>
            );
          })}
          {/* Today, over every row. */}
          <div style={{ position: "absolute", top: 44, bottom: 0, left: LABELS + x(now) + px / 2, width: 2, marginLeft: -1, background: palette.accent, opacity: 0.6, pointerEvents: "none", zIndex: 1 }} />
        </div>
      </div>
    </div>
  );
}
