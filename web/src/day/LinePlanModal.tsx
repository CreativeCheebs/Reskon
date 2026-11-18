import { useEffect, useState } from "react";
import { Form, Input, Modal } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { message } from "../theme/feedback";
import { palette } from "../theme/palette";
import { addLineBody, editLineBody, loggedOfEstimate, minutesText, parseMinutes } from "./plan";
import type { Task } from "../types";
import type { DayItem } from "./types";

export type LineTarget = { type: "add"; taskId: number } | { type: "edit"; item: DayItem };

/**
 * What a day's line says: the time planned for this day (may be left blank) and
 * an optional name for this line. Used when a task is put on the plan (the
 * task's own estimate is not used as the day's plan) and for "Edit plan".
 * A name that differs from the task's makes a renamed line; the task keeps its own.
 */
export function LinePlanModal({ target, day, onDone, onClose }: { target: LineTarget; day: string; onDone: () => void; onClose: () => void }) {
  const { online } = useApp();
  const item = target.type === "edit" ? target.item : null;
  const [task, setTask] = useState<Task | null>(null);
  const [minutes, setMinutes] = useState(item?.planned_min ? minutesText(item.planned_min) : "");
  const [name, setName] = useState(item?.title ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target.type !== "add") return;
    let live = true;
    api
      .get<Task>(`/tasks/${target.taskId}`)
      .then((t) => {
        if (!live) return;
        setTask(t);
        setName((n) => n || t.title);
      })
      .catch((e: Error) => live && message.error(e.message));
    return () => {
      live = false;
    };
  }, [target]);

  const isEvent = item?.kind === "event";
  const taskTitle = item ? item.task_title : (task?.title ?? "");
  const minutesBad = minutes.trim() !== "" && (parseMinutes(minutes) === null || (parseMinutes(minutes) ?? 0) > 1440);
  const ready = online && !minutesBad && name.trim() !== "" && (item !== null || task !== null) && (!isEvent || parseMinutes(minutes) !== null);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      if (item) await api.patch(`/day-items/${item.id}`, editLineBody(item, minutes, name));
      else if (task) await api.post(`/day/${day}/items`, addLineBody(task.id, task.title, minutes, name));
      onDone();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
      setBusy(false);
    }
  };

  const title = item ? "Edit plan" : "Plan this task";
  return (
    <Modal open centered width={420} title={title} okText={item ? "Save" : "Add to plan"} onOk={save} onCancel={onClose} okButtonProps={{ disabled: !ready, loading: busy }}>
      {!isEvent && (
        <div style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>
          {item ? (item.task_title ?? item.title) : (task?.title ?? "Loading…")}
          {item ? ` · ${loggedOfEstimate(item)} (all time)` : task ? ` · ${loggedOfEstimate({ logged_h: task.logged_h, estimate_h: task.estimate_h })} (all time)` : ""}
        </div>
      )}
      <Form layout="vertical" onFinish={save}>
        <Form.Item
          label={isEvent ? "Planned duration" : "Planned time today (optional)"}
          htmlFor="line-minutes"
          extra="Minutes, or like 1h 30m. Only for this day."
          validateStatus={minutesBad ? "error" : undefined}
          help={minutesBad ? "Enter minutes, like 45 or 1h 30m (up to 24h)." : undefined}
          style={{ marginBottom: 12 }}
        >
          <Input id="line-minutes" autoFocus value={minutes} onChange={(e) => setMinutes(e.target.value)} onPressEnter={save} placeholder="e.g. 2h" />
        </Form.Item>
        <Form.Item
          label={isEvent ? "Name" : "Name for this line (optional)"}
          htmlFor="line-name"
          extra={!isEvent && taskTitle ? "Changing it names this line only; the task keeps its own name." : undefined}
          style={{ marginBottom: 4 }}
        >
          <Input id="line-name" value={name} maxLength={300} onChange={(e) => setName(e.target.value)} onPressEnter={save} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
