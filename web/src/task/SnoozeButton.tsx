import { useState } from "react";
import { Button, DatePicker, InputNumber, Popover, Space, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { today } from "../format";
import type { Task } from "../types";
import { daysUntil, intervalLabel, snoozeIntervals, snoozeMaxDays } from "./snoozeIntervals";

// Snooze hides an open task from boards and tables for some days; it keeps
// its status. The server checks the cap (Settings → Snooze) and works out
// the date it shows again. Done and cancelled tasks have no snooze.

/** "Wed 5 Nov" for a local YYYY-MM-DD date. */
export function formatWakeDate(day: string): string {
  return new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Snoozes for days, or wakes with 0; or, with untilUnblocked, while an
 *  open task blocks it. Returns the updated task. */
export function snoozeTask(id: number, days: number, untilUnblocked = false): Promise<Task> {
  return api.post<Task>(`/tasks/${id}/snooze`, { days, until_unblocked: untilUnblocked, today: today() });
}

/** When a snoozed task shows again, in words. */
export function wakeLabel(t: Task): string {
  if (t.snoozed_until && t.snoozed_until > today()) return formatWakeDate(t.snoozed_until);
  return t.snooze_until_unblocked ? "When unblocked" : "";
}

export function SnoozeButton({ task, onChanged }: { task: Task; onChanged: (t: Task) => void }) {
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const max = snoozeMaxDays(boot.settings);
  const [days, setDays] = useState<number | null>(Math.min(7, max));
  if (task.behaviour !== "todo" && task.behaviour !== "in_progress") return null;

  const run = async (n: number, untilUnblocked = false) => {
    try {
      onChanged(await snoozeTask(task.id, n, untilUnblocked));
      setOpen(false);
      message.success(untilUnblocked ? "Snoozed until its blockers are done" : n === 0 ? "Awake again" : `Snoozed for ${n === 1 ? "a day" : `${n} days`}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const quick = snoozeIntervals(boot.settings);

  const content = (
    <Space direction="vertical" size={10} style={{ width: 240 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Hidden from boards and tables until then. It keeps its status.
      </Typography.Text>
      <Space wrap size={6}>
        {quick.map((n) => (
          <Button key={n} size="small" onClick={() => run(n)}>
            {intervalLabel(n)}
          </Button>
        ))}
      </Space>
      <DatePicker
        size="small"
        placeholder="Pick a date"
        format="ddd D MMM YYYY"
        style={{ width: "100%" }}
        aria-label="Snooze until a date"
        disabledDate={(d: Dayjs) => {
          const n = daysUntil(today(), d.format("YYYY-MM-DD"));
          return n < 1 || n > max;
        }}
        onChange={(d: Dayjs | null) => d && run(daysUntil(today(), d.format("YYYY-MM-DD")))}
        value={null}
        defaultPickerValue={dayjs(today()).add(1, "day")}
      />
      <Space.Compact size="small" style={{ width: "100%" }}>
        <InputNumber
          min={1}
          max={max}
          precision={0}
          value={days}
          onChange={setDays}
          addonAfter="days"
          style={{ flex: 1 }}
          aria-label="Days to snooze"
          onPressEnter={() => days && run(days)}
        />
        <Button type="primary" disabled={!days} onClick={() => days && run(days)}>
          Snooze
        </Button>
      </Space.Compact>
      {task.blocked && !task.snooze_until_unblocked && (
        <Button size="small" block onClick={() => run(0, true)}>
          Until blockers are done
        </Button>
      )}
      {task.snoozed && (
        <Button size="small" block onClick={() => run(0)}>
          Wake now
        </Button>
      )}
    </Space>
  );

  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} content={content} title={`Snooze, up to ${max} days`} placement="bottomRight">
      <WriteButton size="small" type={task.snoozed ? "primary" : "default"} ghost={task.snoozed}>
        {!task.snoozed ? "Snooze" : wakeLabel(task) === "When unblocked" ? "Snoozed until unblocked" : `Snoozed until ${wakeLabel(task)}`}
      </WriteButton>
    </Popover>
  );
}
