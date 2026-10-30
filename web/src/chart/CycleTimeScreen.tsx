import { useEffect, useMemo, useState } from "react";
import { Empty, Segmented, Select, Spin } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { TaskPanel } from "../task/TaskPanel";
import { ViewIconMark } from "../icons/ViewIconMark";
import { CycleRows, CycleSummary, type CycleRow } from "./CycleChart";
import { chartColors, unitFor, unitName } from "./cycleScale";

// Stacked cycle-time chart for one view: a bar per task, split by status,
// on a shared time axis, so it shows where work waits. The summary sums
// time per status across all the bars.

interface CycleTime {
  tasks: CycleRow[];
  status_totals: Record<string, number>;
}

type Scale = "shared" | "each";
type Order = "longest" | "title";

export function CycleTimeScreen() {
  const { boot, reloadKey, statusById } = useApp();
  const views = [...boot.views].sort((a, b) => a.position - b.position);
  const [viewId, setViewId] = useState<number | undefined>(views[0]?.id);
  const [data, setData] = useState<CycleTime | null>(null);
  const [scale, setScale] = useState<Scale>("shared");
  const [order, setOrder] = useState<Order>("longest");
  const [openTask, setOpenTask] = useState<number | null>(null);

  useEffect(() => {
    if (!viewId) return;
    setData(null);
    api
      .get<CycleTime>(`/cycle-time?view=${viewId}`)
      .then(setData)
      .catch((e) => message.error((e as Error).message));
  }, [viewId, reloadKey]);

  const rows = useMemo(() => {
    const r = [...(data?.tasks ?? [])];
    r.sort((a, b) => (order === "longest" ? b.total_h - a.total_h : a.title.localeCompare(b.title)));
    return r;
  }, [data, order]);
  const statusIds = useMemo(
    () =>
      Object.keys(data?.status_totals ?? {})
        .map(Number)
        .sort((a, b) => (statusById.get(a)?.position ?? 1e9) - (statusById.get(b)?.position ?? 1e9)),
    [data, statusById],
  );
  const colors = useMemo(() => chartColors(statusIds, statusById), [statusIds, statusById]);
  const maxH = rows.reduce((m, r) => Math.max(m, r.total_h), 0);
  const unit = unitFor(maxH);
  const totalsUnit = unitFor(Math.max(0, ...Object.values(data?.status_totals ?? {})));

  return (
    <div style={{ maxWidth: 1280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px 20px", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: "24px", fontWeight: 600, whiteSpace: "nowrap" }}>Cycle time</div>
          <Select
            size="small"
            style={{ flex: "0 1 220px", minWidth: 140 }}
            value={viewId}
            onChange={setViewId}
            aria-label="View"
            options={views.map((v) => ({
              value: v.id,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ViewIconMark icon={v.icon} color={v.color} size={14} />
                  {v.name}
                </span>
              ),
            }))}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", rowGap: 8, marginLeft: "auto" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: palette.subtle }}>
            Scale
            <Segmented<Scale>
              size="small"
              value={scale}
              onChange={setScale}
              options={[
                { value: "shared", label: "Shared time axis" },
                { value: "each", label: "Each bar full width" },
              ]}
            />
          </label>
          <Select<Order>
            size="small"
            style={{ width: 160 }}
            value={order}
            onChange={setOrder}
            aria-label="Sort"
            options={[
              { value: "longest", label: "Sort: Longest first" },
              { value: "title", label: "Sort: By title" },
            ]}
          />
        </div>
      </div>

      {!data ? (
        <Spin />
      ) : rows.length === 0 ? (
        <Empty description="No tasks in this view" />
      ) : (
        <>
          <p style={{ margin: "0 0 12px", color: palette.muted, fontSize: 12, maxWidth: 760 }}>
            Each bar runs from when the task was created until now, split by the status it was in. Lengths are
            calendar time from the status history, not logged work.{" "}
            {scale === "shared"
              ? `All bars share one axis in ${unitName(unit)}, so longer bars are older tasks.`
              : "Every bar is stretched to full width, so compare the share of each status, not lengths."}{" "}
            Hover a bar for its breakdown; click a row to open the task.
          </p>
          <CycleSummary ids={statusIds} totals={data.status_totals} colors={colors} taskCount={rows.length} unit={totalsUnit} />
          <div style={{ marginTop: 16 }}>
            <CycleRows rows={rows} scale={scale} unit={unit} colors={colors} onOpen={setOpenTask} />
          </div>
        </>
      )}
      {openTask !== null && (
        <TaskPanel taskId={openTask} onClose={() => setOpenTask(null)} onChanged={() => undefined} onDeleted={() => undefined} />
      )}
    </div>
  );
}
