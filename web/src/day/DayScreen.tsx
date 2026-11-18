import { useState } from "react";
import { Button, DatePicker, Spin } from "antd";
import { LeftOutlined, RightOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api";
import { useApp } from "../store";
import { today } from "../format";
import { SessionModal } from "../sessions/SessionModal";
import { usePlanner } from "./usePlanner";
import { AvailablePanel } from "./AvailablePanel";
import { PlannerSettings } from "./PlannerSettings";
import { PlanList } from "./PlanList";
import { InForce } from "./InForce";
import { AddToPlanModal } from "./AddToPlanModal";
import { RescheduleModal } from "./RescheduleModal";
import { sessionStartFor } from "./logSession";
import type { DayItem } from "./types";

// The Day Planner (SPEC 8.3): a day's list of tasks and events, planned
// time against available time, and the day note. It replaces the old
// ceilings morning plan; any day can be opened and edited, nothing locks.

type Dialog = { type: "add" } | { type: "log"; item: DayItem } | { type: "reschedule"; item: DayItem } | { type: "settings" } | null;

export function DayScreen({ date, onDate }: { date?: string; onDate: (d: string) => void }) {
  const { boot, behaviourOf } = useApp();
  const day = date ?? today();
  const { data, load, run } = usePlanner(day);
  const [dialog, setDialog] = useState<Dialog>(null);

  const shift = (n: number) => onDate(dayjs(day).add(n, "day").format("YYYY-MM-DD"));
  const addTask = (taskId: number) => run(() => api.post(`/day/${day}/items`, { task_id: taskId }));

  // Back to a status: the task moves (the ordinary move, which logs the status change), then leaves the day.
  const moveBack = (itemId: number, taskId: number, statusId: number) =>
    run(async () => {
      await api.post(`/tasks/${taskId}/move`, { status_id: statusId, today: today() });
      await api.del(`/day-items/${itemId}`);
    });
  const statusChoices = boot.statuses
    .filter((s) => behaviourOf(s.id) === "todo" || behaviourOf(s.id) === "in_progress")
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, name: s.name }));

  const log = dialog?.type === "log" ? sessionStartFor(dialog.item, day, boot.areas) : null;
  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button size="small" icon={<LeftOutlined />} onClick={() => shift(-1)} aria-label="Previous day" />
        <DatePicker size="small" allowClear={false} value={dayjs(day)} format="ddd D MMM YYYY" onChange={(d) => d && onDate(d.format("YYYY-MM-DD"))} />
        <Button size="small" icon={<RightOutlined />} onClick={() => shift(1)} aria-label="Next day" />
        {day !== today() && (
          <Button size="small" type="link" onClick={() => onDate(today())}>
            Today
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setDialog({ type: "settings" })} disabled={!data}>
          Planner settings
        </Button>
      </div>
      {!data ? (
        <Spin style={{ margin: 40 }} />
      ) : (
        <>
          <InForce data={data} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
            <AvailablePanel data={data} run={run} onMoveBack={moveBack} />
            <PlanList
              data={data}
              run={run}
              onAdd={() => setDialog({ type: "add" })}
              onDropTask={addTask}
              rowActions={() => ({
                onLog: (i) => setDialog({ type: "log", item: i }),
                onReschedule: (i) => setDialog({ type: "reschedule", item: i }),
                onMoveToStatus: (i, statusId) => i.task_id && moveBack(i.id, i.task_id, statusId),
                statusChoices,
              })}
            />
          </div>
        </>
      )}
      {dialog?.type === "add" && <AddToPlanModal day={day} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "settings" && data && <PlannerSettings day={day} totals={data.plan_totals} dayOverride={data.plan.available_min ?? null} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "reschedule" && <RescheduleModal item={dialog.item} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "log" && log && <SessionModal initial={log.initial} extra={log.extra} onSaved={() => load()} onClose={() => setDialog(null)} />}
    </div>
  );
}
