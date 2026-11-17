import { useState } from "react";
import { Button, DatePicker, InputNumber, Popover, Space, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { today } from "../format";
import type { Task } from "../types";
import { daysUntil, snoozeIntervals, snoozeMaxDays } from "./snoozeIntervals";
import { daysFromToday, forecastLabel, forecastSentence, formatWakeDate, SnoozeHead, SnoozeRowBody, useSnoozeForecast } from "./SnoozeForecast";

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
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const max = snoozeMaxDays(boot.settings);
  const [days, setDays] = useState<number | null>(Math.min(7, max));

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
  // The numbers come when the menu opens; until they do, or if they fail,
  // the choices work without them.
  const forecast = useSnoozeForecast(quick.map(daysFromToday), task.id, open);
  const [calendarDay, setCalendarDay] = useState<string | null>(null); // a date picked but not yet confirmed
  const calendar = useSnoozeForecast(calendarDay ? [calendarDay] : [], task.id, open && !!calendarDay);
  const typedDay = days ? daysFromToday(days) : null;
  const typed = useSnoozeForecast(typedDay && !quick.includes(days!) ? [typedDay] : [], task.id, open && !!typedDay && !quick.includes(days!), 250);
  if (task.behaviour !== "todo" && task.behaviour !== "in_progress") return null;

  const content = (
    <Space direction="vertical" size={8} style={{ width: 320 }}>
      <div role="group" aria-label="Snooze until">
        {quick.length > 0 && <SnoozeHead />}
        {quick.map((n) => (
          <button key={n} type="button" aria-label={forecastLabel(n, forecast)} className="jb-snooze-row" onClick={() => run(n)}>
            <SnoozeRowBody days={n} state={forecast} />
          </button>
        ))}
      </div>
      <DatePicker
        size="small"
        placeholder="Pick a date"
        format="ddd D MMM YYYY"
        style={{ width: "calc(100% - 24px)", margin: "0 12px" }}
        needConfirm
        aria-label="Snooze until a date"
        onCalendarChange={(d: Dayjs | Dayjs[]) => setCalendarDay(d && !Array.isArray(d) ? d.format("YYYY-MM-DD") : null)}
        onOpenChange={(o: boolean) => !o && setCalendarDay(null)}
        renderExtraFooter={() =>
          calendarDay ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }} aria-live="polite">
              {forecastSentence(calendar, calendarDay)}
            </Typography.Text>
          ) : null
        }
        disabledDate={(d: Dayjs) => {
          const n = daysUntil(today(), d.format("YYYY-MM-DD"));
          return n < 1 || n > max;
        }}
        onChange={(d: Dayjs | null) => d && run(daysUntil(today(), d.format("YYYY-MM-DD")))}
        value={null}
        defaultPickerValue={dayjs(today()).add(1, "day")}
      />
      <Space.Compact size="small" style={{ width: "calc(100% - 24px)", margin: "0 12px" }}>
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
      {typedDay && !quick.includes(days!) && (
        <Typography.Text type="secondary" style={{ fontSize: 12, padding: "0 12px" }} aria-live="polite">
          {forecastSentence(typed, typedDay)}
        </Typography.Text>
      )}
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
    <Popover trigger="click" open={open} onOpenChange={setOpen} content={content} placement="bottomRight">
      <WriteButton size="small" type={task.snoozed ? "primary" : "default"} ghost={task.snoozed}>
        {!task.snoozed ? "Snooze" : wakeLabel(task) === "When unblocked" ? "Snoozed until unblocked" : `Snoozed until ${wakeLabel(task)}`}
      </WriteButton>
    </Popover>
  );
}
