import { useState } from "react";
import { Input } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { WriteButton } from "../offline";
import { Totals } from "./Totals";
import { PlanRow, type RowActions } from "./PlanRow";
import { reorderIds, stepIds } from "./plan";
import { drag } from "./drag";
import type { Run } from "./usePlanner";
import type { DayData, DayItem } from "./types";

/**
 * The day's plan: totals, the ordered lines, and the day note. Planned time
 * is the sum of full estimates (the server's number); each task row shows
 * that task's all-time figures, marked as such, apart from the day's totals.
 */
export function PlanList({
  data,
  run,
  onAdd,
  rowActions,
  onDropTask,
}: {
  data: DayData;
  run: Run;
  onAdd: () => void;
  /** The actions that open a dialog or need more state (log, reschedule, timer, move to status). */
  rowActions: (item: DayItem) => Pick<RowActions, "onLog" | "onReschedule" | "onStartTimer" | "onMoveToStatus" | "statusChoices" | "timing">;
  /** A task dragged in from Available tasks was dropped on the plan. */
  onDropTask: (taskId: number) => void;
}) {
  const { online } = useApp();
  const day = data.day;
  const ids = data.items.map((i) => i.id);
  const order = (next: number[]) => run(() => api.put(`/day/${day}/order`, { ids: next }));

  const base = (item: DayItem): RowActions => ({
    onRemove: (i) => run(() => api.del(`/day-items/${i.id}`)),
    onStep: (i, step) => order(stepIds(ids, i.id, step)),
    onDropBefore: (before) => {
      const d = drag.current;
      drag.end();
      if (d?.type === "item") order(reorderIds(ids, d.id, before));
    },
    ...rowActions(item),
  });

  const [overList, setOverList] = useState(false);
  const accepts = () => drag.current !== null;

  return (
    <section aria-labelledby="plan-heading" style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 16px 16px", minWidth: 0 }}>
      <header>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 id="plan-heading" style={{ fontSize: 16, margin: 0 }}>
              {dayjs(day).format("dddd D MMMM")}
            </h2>
            <div style={{ color: palette.muted, fontSize: 12 }}>
              {data.items.length === 0 ? "Nothing planned" : `${data.items.length} on the plan`}
            </div>
          </div>
          <WriteButton type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            Add to plan
          </WriteButton>
        </div>
        <Totals totals={data.plan_totals} />
      </header>

      <div style={{ display: "flex", justifyContent: "space-between", color: palette.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "14px 0 6px" }} aria-hidden>
        <span>Plan</span>
        <span>Logged / estimate (all time)</span>
      </div>
      <ul aria-label="Planned tasks and events" style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {data.items.map((item, i) => (
          <PlanRow key={item.id} item={item} first={i === 0} last={i === data.items.length - 1} actions={base(item)} />
        ))}
      </ul>
      <div
        onDragOver={(e) => {
          if (accepts()) {
            e.preventDefault();
            setOverList(true);
          }
        }}
        onDragLeave={() => setOverList(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOverList(false);
          const d = drag.current;
          drag.end();
          if (d?.type === "task") onDropTask(d.id);
          else if (d?.type === "item") order(reorderIds(ids, d.id, null));
        }}
        style={{
          marginTop: 8,
          padding: 12,
          textAlign: "center",
          color: palette.muted,
          fontSize: 12,
          border: `1px dashed ${overList ? palette.accent : palette.border}`,
          borderRadius: 6,
        }}
      >
        Drop a task here, or add one from Available tasks
      </div>

      <DayNote key={`${day}:${data.plan.note ?? ""}`} note={data.plan.note ?? ""} onSave={(note) => run(() => api.patch(`/day/${day}`, { note: note || null }))} disabled={!online} />
    </section>
  );
}

function DayNote({ note, onSave, disabled }: { note: string; onSave: (n: string) => void; disabled: boolean }) {
  // Its parent gives it a new key whenever the saved note changes, so it starts from the saved text.
  const [text, setText] = useState(note);
  return (
    <div style={{ marginTop: 14 }}>
      <label htmlFor="day-note" style={{ color: palette.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
        Day notes
      </label>
      <Input.TextArea id="day-note" rows={2} value={text} disabled={disabled} maxLength={4000} placeholder="Add a note for this day…" onChange={(e) => setText(e.target.value)} onBlur={() => text !== note && onSave(text.trim())} style={{ marginTop: 4 }} />
    </div>
  );
}
