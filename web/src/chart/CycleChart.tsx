import { Fragment, useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import { useApp } from "../store";
import { formatDateTime } from "../format";
import { palette } from "../theme/palette";
import type { Segment } from "../types";
import { CycleBar } from "./CycleBar";
import { formatSpan, ticks, unitName, type Unit } from "./cycleScale";

// The two parts of the cycle-time chart: the all-tasks summary (one bar and
// a figure per status under it) and the per-task rows on a common grid of
// name, bar and total, with an axis above the bars.

export interface CycleRow {
  task_id: number;
  title: string;
  segments: Segment[];
  total_h: number;
  status_hours: Record<string, number>;
}

const pct = (part: number, whole: number) => {
  if (whole <= 0) return "–";
  const p = (part / whole) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
};

function Swatch({ color }: { color: string }) {
  return <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flex: "none" }} />;
}

export function CycleSummary({
  ids,
  totals,
  colors,
  taskCount,
  unit,
}: {
  ids: number[];
  totals: Record<string, number>;
  colors: Map<number, string>;
  taskCount: number;
  unit: Unit;
}) {
  const { statusById } = useApp();
  const sum = ids.reduce((s, id) => s + totals[id], 0);
  const segs: Segment[] = ids.map((id) => ({ status_id: id, from: "", to: "", hours: totals[id], current: false }));
  return (
    <section style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "10px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Time in each status, all tasks combined</span>
        <span style={{ color: palette.subtle, fontSize: 12 }}>
          {taskCount} {taskCount === 1 ? "task" : "tasks"} · in {unitName(unit)}
        </span>
      </div>
      <CycleBar
        segments={segs}
        scaleH={sum}
        height={14}
        colors={colors}
        tip={(s, name) => (
          <span style={{ fontSize: 12 }}>
            <b>{name}</b> · {formatSpan(s.hours, unit)} · {pct(s.hours, sum)}
          </span>
        )}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "6px 16px", marginTop: 10 }}>
        {ids.map((id) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, minWidth: 0 }}>
            <Swatch color={colors.get(id)!} />
            <span style={{ color: palette.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {statusById.get(id)?.name ?? "deleted status"}
            </span>
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {formatSpan(totals[id], unit)}
              <span style={{ color: palette.subtle, marginLeft: 6, display: "inline-block", minWidth: 30, textAlign: "right" }}>
                {pct(totals[id], sum)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const ROW_H = 26;
const AXIS_H = 24;

/** Width of an element, kept current. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function CycleRows({
  rows,
  scale,
  unit,
  colors,
  onOpen,
}: {
  rows: CycleRow[];
  scale: "shared" | "each";
  unit: Unit;
  colors: Map<number, string>;
  onOpen: (taskId: number) => void;
}) {
  const [axisRef, axisW] = useWidth<HTMLDivElement>();
  const maxH = rows.reduce((m, r) => Math.max(m, r.total_h), 0);
  // Tick positions as fractions of the bar column, with their labels.
  const marks: [number, string][] =
    scale === "shared"
      ? ticks(maxH, unit, Math.max(2, Math.floor(axisW / 90))).map((h) => [maxH > 0 ? h / maxH : 0, formatSpan(h, unit)])
      : [0, 0.25, 0.5, 0.75, 1].map((f) => [f, `${f * 100}%`]);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div
      role="table"
      aria-label="Cycle time per task"
      style={{
        display: "grid",
        gridTemplateColumns: "fit-content(min(300px, 34%)) minmax(0, 1fr) 64px",
        gridTemplateRows: `${AXIS_H}px repeat(${rows.length}, ${ROW_H}px)`,
        columnGap: 14,
        position: "relative",
      }}
    >
      {/* Axis header; it sticks to the top while the rows scroll under it. */}
      <div
        role="row"
        style={{
          gridColumn: "1 / -1",
          display: "grid",
          gridTemplateColumns: "subgrid",
          alignItems: "end",
          position: "sticky",
          top: -14, // the content area's padding
          zIndex: 2,
          background: palette.bg,
          borderBottom: `1px solid ${palette.border}`,
          fontSize: 11,
          lineHeight: "16px",
          color: palette.subtle,
          paddingBottom: 4,
        }}
      >
        <span role="columnheader" style={{ paddingLeft: 8 }}>
          Task
        </span>
        <div role="columnheader" ref={axisRef} style={{ position: "relative", height: 16 }}>
          {marks.map(([f, label], i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${f * 100}%`,
                // The first label starts at its tick, the last ends at it.
                transform: f === 0 ? undefined : f >= 0.999 && scale === "each" ? "translateX(-100%)" : "translateX(-50%)",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <span role="columnheader" style={{ textAlign: "right", paddingRight: 8 }}>
          Total
        </span>
      </div>

      {/* Gridlines behind the bars, one per tick. */}
      <div aria-hidden style={{ gridColumn: 2, gridRow: "2 / -1", position: "relative", pointerEvents: "none" }}>
        {marks.map(([f], i) =>
          f > 0 ? <span key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${f * 100}%`, borderLeft: `1px dashed ${palette.border}` }} /> : null,
        )}
      </div>

      {rows.map((r, i) => (
        <div
          key={r.task_id}
          role="row"
          onMouseEnter={() => setHover(r.task_id)}
          onMouseLeave={() => setHover((h) => (h === r.task_id ? null : h))}
          onClick={() => onOpen(r.task_id)}
          style={{
            gridColumn: "1 / -1",
            gridRow: i + 2,
            display: "grid",
            gridTemplateColumns: "subgrid",
            alignItems: "center",
            cursor: "pointer",
            borderRadius: 4,
            background: hover === r.task_id ? `${palette.hover}B3` : undefined,
            zIndex: 1,
          }}
        >
          <span
            role="cell"
            style={{ paddingLeft: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}
            title={r.title}
          >
            {r.title}
          </span>
          <Tooltip
            placement="top"
            mouseEnterDelay={0.15}
            title={<RowTip row={r} unit={unit} colors={colors} />}
            styles={{ root: { maxWidth: 360 } }}
          >
            <div role="cell" style={{ height: "100%", display: "flex", alignItems: "center" }}>
              <CycleBar segments={r.segments} scaleH={scale === "shared" ? maxH : r.total_h} height={12} colors={colors} tip={() => null} />
            </div>
          </Tooltip>
          <span
            role="cell"
            style={{ textAlign: "right", paddingRight: 8, fontSize: 12, color: palette.muted, fontVariantNumeric: "tabular-nums" }}
          >
            {formatSpan(r.total_h, unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Everything one bar says, including statuses too short to see. */
function RowTip({ row, unit, colors }: { row: CycleRow; unit: Unit; colors: Map<number, string> }) {
  const { statusById } = useApp();
  // Statuses in the order the task first entered them.
  const order = [...new Set(row.segments.map((s) => s.status_id))];
  const now = row.segments.find((s) => s.current);
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.title}</div>
      <div style={{ color: palette.muted, marginBottom: 6 }}>
        {formatSpan(row.total_h, unit)} since {formatDateTime(row.segments[0]?.from)}
        {now && ` · now ${statusById.get(now.status_id)?.name ?? "deleted status"}`}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "2px 8px", alignItems: "center" }}>
        {order.map((id) => (
          <Fragment key={id}>
            <Swatch color={colors.get(id) ?? palette.borderStrong} />
            <span>{statusById.get(id)?.name ?? "deleted status"}</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatSpan(row.status_hours[id] ?? 0, unit)}</span>
            <span style={{ textAlign: "right", color: palette.muted, fontVariantNumeric: "tabular-nums" }}>{pct(row.status_hours[id] ?? 0, row.total_h)}</span>
          </Fragment>
        ))}
      </div>
      {row.segments.length > 1 && (
        <div style={{ color: palette.muted, marginTop: 6 }}>
          {row.segments.length - 1} status {row.segments.length === 2 ? "change" : "changes"} · click for the full history
        </div>
      )}
    </div>
  );
}
