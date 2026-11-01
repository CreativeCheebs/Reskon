import { useState } from "react";
import { Button, InputNumber, Popover, Space, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { today } from "../format";
import type { Task } from "../types";

// Snooze hides an open task from boards and tables for some days; it keeps
// its status. The server checks the cap (Settings → Snooze) and works out
// the date it shows again. Done and cancelled tasks have no snooze.

const QUICK = [1, 3, 7, 14, 30];

/** The cap from Settings → Snooze. */
export function snoozeMaxDays(settings: Record<string, unknown>): number {
  return (settings.snooze as { max_days?: number } | undefined)?.max_days ?? 30;
}

/** "Wed 5 Nov" for a local YYYY-MM-DD date. */
export function formatWakeDate(day: string): string {
  return new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Snoozes for days, or wakes with 0. Returns the updated task. */
export function snoozeTask(id: number, days: number): Promise<Task> {
  return api.post<Task>(`/tasks/${id}/snooze`, { days, today: today() });
}

export function SnoozeButton({ task, onChanged }: { task: Task; onChanged: (t: Task) => void }) {
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const max = snoozeMaxDays(boot.settings);
  const [days, setDays] = useState<number | null>(Math.min(7, max));
  if (task.behaviour !== "todo" && task.behaviour !== "in_progress") return null;

  const run = async (n: number) => {
    try {
      onChanged(await snoozeTask(task.id, n));
      setOpen(false);
      message.success(n === 0 ? "Awake again" : `Snoozed for ${n === 1 ? "a day" : `${n} days`}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const quick = [...new Set([...QUICK.filter((n) => n < max), max])];

  const content = (
    <Space direction="vertical" size={10} style={{ width: 240 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Hidden from boards and tables until then. It keeps its status.
      </Typography.Text>
      <Space wrap size={6}>
        {quick.map((n) => (
          <Button key={n} size="small" onClick={() => run(n)}>
            {n === 1 ? "1 day" : n % 7 === 0 && n < 30 ? `${n / 7} wk` : `${n} days`}
          </Button>
        ))}
      </Space>
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
        {task.snoozed && task.snoozed_until ? `Snoozed until ${formatWakeDate(task.snoozed_until)}` : "Snooze"}
      </WriteButton>
    </Popover>
  );
}
