import { useState } from "react";
import { Button, Popover } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { WriteButton } from "../offline";
import { today } from "../format";
import type { Task } from "../types";
import { formatWakeDate } from "./SnoozeForecast";
import { SnoozeChoices } from "./SnoozeChoices";

// Snooze hides an open task from boards and tables for some days; it keeps
// its status. The server checks the cap (Settings → Snooze) and works out
// the date it shows again. Done and cancelled tasks have no snooze.

export { formatWakeDate };

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
  const [open, setOpen] = useState(false);

  const run = async (n: number, untilUnblocked = false) => {
    try {
      onChanged(await snoozeTask(task.id, n, untilUnblocked));
      setOpen(false);
      message.success(untilUnblocked ? "Snoozed until its blockers are done" : n === 0 ? "Awake again" : `Snoozed for ${n === 1 ? "a day" : `${n} days`}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  if (task.behaviour !== "todo" && task.behaviour !== "in_progress") return null;

  const content = (
    <SnoozeChoices excludeId={task.id} active={open} onPick={run}>
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
    </SnoozeChoices>
  );

  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} content={content} placement="bottomRight">
      <WriteButton size="small" type={task.snoozed ? "primary" : "default"} ghost={task.snoozed}>
        {!task.snoozed ? "Snooze" : wakeLabel(task) === "When unblocked" ? "Snoozed until unblocked" : `Snoozed until ${wakeLabel(task)}`}
      </WriteButton>
    </Popover>
  );
}
