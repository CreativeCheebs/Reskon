import { useEffect, useMemo, useState } from "react";
import { Empty, Radio, Select, Space, Spin, Typography, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { formatAge } from "../format";
import { palette } from "../theme/palette";
import { TaskPanel } from "../task/TaskPanel";
import type { Segment } from "../types";
import { CycleBar, StatusLegend } from "./CycleBar";

// Stacked cycle-time chart for one view: a bar per task, split by status,
// on a shared time axis, so it shows where work waits. The totals row sums
// hours per status across all the bars.

interface CycleTime {
  tasks: { task_id: number; title: string; segments: Segment[]; total_h: number }[];
  status_totals: Record<string, number>;
}

export function CycleTimeScreen() {
  const { boot, reloadKey } = useApp();
  const views = [...boot.views].sort((a, b) => a.position - b.position);
  const [viewId, setViewId] = useState<number | undefined>(views[0]?.id);
  const [data, setData] = useState<CycleTime | null>(null);
  const [scale, setScale] = useState<"shared" | "each">("shared");
  const [order, setOrder] = useState<"longest" | "title">("longest");
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
  const maxH = rows.reduce((m, r) => Math.max(m, r.total_h), 0);
  const statusIds = Object.keys(data?.status_totals ?? {}).map(Number);
  const totalSegs: Segment[] = statusIds
    .sort((a, b) => (boot.statuses.find((s) => s.id === a)?.position ?? 99) - (boot.statuses.find((s) => s.id === b)?.position ?? 99))
    .map((id) => ({ status_id: id, from: "", to: "", hours: data!.status_totals[id], current: false }));

  return (
    <div style={{ maxWidth: 1100 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Cycle time</div>
        <Select
          size="small"
          style={{ width: 200 }}
          value={viewId}
          onChange={setViewId}
          options={views.map((v) => ({ value: v.id, label: v.name }))}
        />
        <Radio.Group size="small" value={scale} onChange={(e) => setScale(e.target.value)}>
          <Radio.Button value="shared">Shared time axis</Radio.Button>
          <Radio.Button value="each">Each bar full width</Radio.Button>
        </Radio.Group>
        <Radio.Group size="small" value={order} onChange={(e) => setOrder(e.target.value)}>
          <Radio.Button value="longest">Longest first</Radio.Button>
          <Radio.Button value="title">By title</Radio.Button>
        </Radio.Group>
      </Space>
      {!data ? (
        <Spin />
      ) : rows.length === 0 ? (
        <Empty description="No tasks in this view" />
      ) : (
        <>
          <StatusLegend ids={statusIds} />
          <div style={{ margin: "14px 0 6px", color: palette.muted, fontSize: 12 }}>All tasks, hours per status</div>
          <CycleBar segments={totalSegs} scaleH={totalSegs.reduce((s, x) => s + x.hours, 0)} height={18} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: palette.muted, marginTop: 4 }}>
            {totalSegs.map((s) => (
              <span key={s.status_id}>
                {boot.statuses.find((x) => x.id === s.status_id)?.name ?? "deleted"}: {formatAge(s.hours)}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "240px 1fr 60px", gap: "6px 12px", alignItems: "center" }}>
            {rows.map((r) => (
              <Row key={r.task_id} title={r.title} total={r.total_h} onOpen={() => setOpenTask(r.task_id)}>
                <CycleBar segments={r.segments} scaleH={scale === "shared" ? maxH : r.total_h} />
              </Row>
            ))}
          </div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 11 }}>
            Every segment comes straight from the task's transition log: it starts at one move and ends at the next.
          </Typography.Paragraph>
        </>
      )}
      {openTask !== null && (
        <TaskPanel taskId={openTask} onClose={() => setOpenTask(null)} onChanged={() => undefined} onDeleted={() => undefined} />
      )}
    </div>
  );
}

function Row({ title, total, onOpen, children }: { title: string; total: number; onOpen: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onOpen}
        style={{ cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        title={title}
      >
        {title}
      </div>
      <div>{children}</div>
      <div style={{ color: palette.muted, fontSize: 11, textAlign: "right" }}>{formatAge(total)}</div>
    </>
  );
}
