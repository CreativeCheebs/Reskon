import { useState } from "react";
import { Button, DatePicker, InputNumber, Space, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useApp } from "../store";
import { today } from "../format";
import { daysUntil, snoozeIntervals, snoozeMaxDays } from "./snoozeIntervals";
import { daysFromToday, forecastLabel, forecastSentence, SnoozeHead, SnoozeRowBody, useSnoozeForecast } from "./SnoozeForecast";

/**
 * The snooze menu's choices: the user's snooze list (with what is already
 * coming back each day), a date picker, and a days box. Choosing one calls
 * onPick with a number of days from today. Used by a task's Snooze button
 * and by the new-task form's Snooze until field, so both offer the same menu.
 * `active` is whether the menu is showing: the numbers are asked of the
 * server only then. excludeId is the task being snoozed (0 for a new task).
 */
export function SnoozeChoices({ excludeId, active, onPick, children }: { excludeId: number; active: boolean; onPick: (days: number) => void; children?: React.ReactNode }) {
  const { boot } = useApp();
  const max = snoozeMaxDays(boot.settings);
  const [days, setDays] = useState<number | null>(Math.min(7, max));
  const quick = snoozeIntervals(boot.settings);
  // The numbers come when the menu opens; until they do, or if they fail,
  // the choices work without them.
  const forecast = useSnoozeForecast(quick.map(daysFromToday), excludeId, active);
  const [calendarDay, setCalendarDay] = useState<string | null>(null); // a date picked but not yet confirmed
  const calendar = useSnoozeForecast(calendarDay ? [calendarDay] : [], excludeId, active && !!calendarDay);
  const typedDay = days ? daysFromToday(days) : null;
  const typed = useSnoozeForecast(typedDay && !quick.includes(days!) ? [typedDay] : [], excludeId, active && !!typedDay && !quick.includes(days!), 250);

  return (
    <Space direction="vertical" size={8} style={{ width: 320 }}>
      <div role="group" aria-label="Snooze until">
        {quick.length > 0 && <SnoozeHead />}
        {quick.map((n) => (
          <button key={n} type="button" aria-label={forecastLabel(n, forecast)} className="jb-snooze-row" onClick={() => onPick(n)}>
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
        onChange={(d: Dayjs | null) => d && onPick(daysUntil(today(), d.format("YYYY-MM-DD")))}
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
          onPressEnter={() => days && onPick(days)}
        />
        <Button type="primary" disabled={!days} onClick={() => days && onPick(days)}>
          Snooze
        </Button>
      </Space.Compact>
      {typedDay && !quick.includes(days!) && (
        <Typography.Text type="secondary" style={{ fontSize: 12, padding: "0 12px" }} aria-live="polite">
          {forecastSentence(typed, typedDay)}
        </Typography.Text>
      )}
      {children}
    </Space>
  );
}
