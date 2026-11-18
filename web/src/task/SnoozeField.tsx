import { useState } from "react";
import { Button, Popover, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { forecastFor, formatWakeDate, daysFromToday, useSnoozeForecast } from "./SnoozeForecast";
import { SnoozeChoices } from "./SnoozeChoices";
import { intervalLabel, snoozeIntervals } from "./snoozeIntervals";
import { useApp } from "../store";

/**
 * "Snooze until" on a new task: empty means not snoozed. It opens the same
 * menu as a task's Snooze button (the user's list with hours and points, a
 * date picker, a days box). `value` is the chosen local date (YYYY-MM-DD) or
 * null; the server checks it when the task is created.
 */
export function SnoozeField({ value, onChange, disabled }: { value: string | null; onChange: (date: string | null) => void; disabled?: boolean }) {
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const quick = snoozeIntervals(boot.settings);
  const named = value ? quick.find((n) => daysFromToday(n) === value) : undefined;
  const forecast = useSnoozeForecast(value ? [value] : [], 0, !!value);
  const back = value ? forecastFor(forecast, value) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Popover
          trigger="click"
          open={open && !disabled}
          onOpenChange={setOpen}
          placement="bottomLeft"
          content={
            <SnoozeChoices
              excludeId={0}
              active={open}
              onPick={(n) => {
                onChange(daysFromToday(n));
                setOpen(false);
              }}
            />
          }
        >
          <Button size="small" disabled={disabled} aria-label="Snooze until">
            {value ? `${formatWakeDate(value)}${named ? ` · ${intervalLabel(named)}` : ""}` : "Not snoozed"}
          </Button>
        </Popover>
        {value && (
          <Button size="small" type="text" icon={<CloseOutlined />} aria-label="Don't snooze" disabled={disabled} onClick={() => onChange(null)} />
        )}
      </div>
      {value && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Hidden until then.{back && !back.zero ? ` Also back that day: ${back.hours} · ${back.points} points` : ""}
        </Typography.Text>
      )}
    </div>
  );
}
