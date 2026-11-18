import { useState } from "react";
import { Alert, Button, DatePicker, Spin } from "antd";
import { LeftOutlined, RightOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { today } from "../format";
import { SessionModal } from "../sessions/SessionModal";
import { usePlanner } from "./usePlanner";
import { AvailablePanel } from "./AvailablePanel";
import { PlannerSettings } from "./PlannerSettings";
import { TimerStrip } from "./TimerStrip";
import { TimerDialogs } from "./TimerDialogs";
import { timingOn } from "./plan";
import { useTimers } from "./useTimers";
import { PlanList } from "./PlanList";
import { InForce } from "./InForce";
import { AddToPlanModal } from "./AddToPlanModal";
import { RescheduleModal } from "./RescheduleModal";
import { LinePlanModal, type LineTarget } from "./LinePlanModal";
import { TaskPanel } from "../task/TaskPanel";
import { sessionStartFor } from "./logSession";
import type { DayItem } from "./types";

// The Day Planner (SPEC 8.3): a day's list of tasks and events, planned
// time against available time, and the day note. It replaces the old
// ceilings morning plan; any day can be opened and edited, nothing locks.

type Dialog = { type: "add" } | { type: "log"; item: DayItem } | { type: "reschedule"; item: DayItem } | { type: "settings" } | { type: "line"; target: LineTarget } | { type: "task"; id: number } | null;

export function DayScreen({ date, onDate }: { date?: string; onDate: (d: string) => void }) {
  const { boot, behaviourOf } = useApp();
  const day = date ?? today();
  const { data, error, fetchedAt, load, run } = usePlanner(day);
  // Bumped when a change alters the tasks themselves (a move, a new task), so Available tasks reads them again.
  const [tasksVersion, setTasksVersion] = useState(0);
  const timers = useTimers(day, run, data?.items ?? [], boot.areas);
  const [dialog, setDialog] = useState<Dialog>(null);

  const shift = (n: number) => onDate(dayjs(day).add(n, "day").format("YYYY-MM-DD"));
  // Putting a task on the plan asks for the day's planned time and an optional name first.
  const addTask = (taskId: number) => setDialog({ type: "line", target: { type: "add", taskId } });
  const toggleDone = (item: DayItem) => run(() => api.patch(`/day-items/${item.id}`, { done: !item.done }));

  // Back to a status: the task moves (the ordinary move, which logs the status change), then leaves the day.
  const moveBack = (itemId: number, taskId: number, statusId: number) =>
    run(async () => {
      await api.post(`/tasks/${taskId}/move`, { status_id: statusId, today: today() });
      setTasksVersion((v) => v + 1);
      try {
        await api.del(`/day-items/${itemId}`);
      } catch {
        // The move happened; say so, rather than a bare failure that hides it.
        const name = boot.statuses.find((s) => s.id === statusId)?.name ?? "the status";
        message.error(`Moved to ${name}, but it is still on the plan. Use "Remove from plan" on its line to take it off this day.`);
      }
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
      {!data && error ? (
        <Alert
          type="error"
          showIcon
          message="The day could not be loaded"
          description={error}
          action={
            <Button size="small" onClick={() => load()}>
              Retry
            </Button>
          }
        />
      ) : !data ? (
        <div role="status" aria-label="Loading the day" style={{ margin: 40 }}>
          <Spin />
        </div>
      ) : (
        <>
          <InForce data={data} />
          <TimerStrip
            list={data.timers}
            fetchedAt={fetchedAt}
            handlers={{ onPause: timers.pause, onResume: timers.resume, onStop: timers.stop, onReview: timers.reviewStopped, onDiscard: timers.discard, busy: timers.busy }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
            <AvailablePanel day={day} data={data} onAdd={addTask} onMoveBack={moveBack} tasksVersion={tasksVersion} />
            <PlanList
              data={data}
              run={run}
              onAdd={() => setDialog({ type: "add" })}
              onDropTask={addTask}
              rowActions={(i) => ({
                onLog: (it) => setDialog({ type: "log", item: it }),
                onReschedule: (it) => setDialog({ type: "reschedule", item: it }),
                onEdit: (it) => setDialog({ type: "line", target: { type: "edit", item: it } }),
                onToggleDone: toggleDone,
                onOpenTask: (id) => setDialog({ type: "task", id }),
                onMoveToStatus: (it, statusId) => it.task_id && moveBack(it.id, it.task_id, statusId),
                statusChoices,
                onStartTimer: timers.start,
                timing: timingOn(data.timers.timers, i, day),
              })}
            />
          </div>
        </>
      )}
      {dialog?.type === "add" && (
        <AddToPlanModal
          day={day}
          plannedTaskIds={new Set(data?.items.flatMap((i) => (i.task_id ? [i.task_id] : [])))}
          onPickTask={addTask}
          onDone={() => {
            setTasksVersion((v) => v + 1);
            void load();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "line" && <LinePlanModal target={dialog.target} day={day} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "task" && (
        <TaskPanel
          taskId={dialog.id}
          onChanged={() => undefined}
          onDeleted={() => {
            setDialog(null);
            void load();
          }}
          onClose={() => {
            setDialog(null);
            void load();
          }}
        />
      )}
      {dialog?.type === "settings" && data && <PlannerSettings day={day} totals={data.plan_totals} dayOverride={data.plan.available_min ?? null} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "reschedule" && <RescheduleModal item={dialog.item} onDone={load} onClose={() => setDialog(null)} />}
      {dialog?.type === "log" && log && <SessionModal initial={log.initial} extra={log.extra} onSaved={() => load()} onClose={() => setDialog(null)} />}
      <TimerDialogs
        draft={timers.draft}
        onSaved={() => load()}
        onFinish={timers.finish}
        blocked={timers.blocked}
        onStopBlocking={timers.stopBlocking}
        onCloseBlocked={timers.closeBlocked}
        offer={timers.offer}
        onStartOffer={timers.start}
        onCloseOffer={timers.closeOffer}
      />
    </div>
  );
}
