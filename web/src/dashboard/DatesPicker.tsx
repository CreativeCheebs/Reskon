import { Button, DatePicker, Segmented, Tooltip } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useApp } from "../store";
import type { DateOverride } from "./types";

// The dashboard's date picker: leave every widget on its own range, or run
// them all over one day or a span of dates. Only the dates are sent; the
// server does the rest, the same as for a widget's own range.

const FMT = "YYYY-MM-DD";

export type DatesMode = "own" | "day" | "dates";

export function DatesPicker({
  mode,
  dates,
  onChange,
}: {
  mode: DatesMode;
  dates: DateOverride | null;
  onChange: (mode: DatesMode, dates: DateOverride | null) => void;
}) {
  const { boot } = useApp();
  const today = dayjs().startOf("day");
  const weekStart = Number(boot.settings.week_start ?? 1) || 1; // 1 = Monday … 7 = Sunday
  const startOfWeek = today.subtract((today.day() - (weekStart % 7) + 7) % 7, "day");
  const span = (from: Dayjs, to: Dayjs): DateOverride => ({ from: from.format(FMT), to: to.format(FMT) });

  const pickMode = (m: DatesMode) => {
    if (m === "own") onChange(m, null);
    else if (m === "day") onChange(m, span(dates ? dayjs(dates.to) : today, dates ? dayjs(dates.to) : today));
    else onChange(m, dates ?? span(startOfWeek, today));
  };
  const day = dates ? dayjs(dates.from) : today;
  const step = (n: number) => {
    const d = day.add(n, "day");
    onChange("day", span(d, d));
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => pickMode(v as DatesMode)}
        options={[
          { value: "own", label: <Tooltip title="Each widget shows its own range">Own ranges</Tooltip> },
          { value: "day", label: "Day" },
          { value: "dates", label: "Dates" },
        ]}
      />
      {mode === "day" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => step(-1)} aria-label="Day before" />
          <DatePicker
            size="small"
            allowClear={false}
            value={day}
            format="ddd D MMM YYYY"
            onChange={(d: Dayjs | null) => d && onChange("day", span(d, d))}
            style={{ width: 150 }}
          />
          <Button size="small" type="text" icon={<RightOutlined />} onClick={() => step(1)} aria-label="Day after" />
          {!day.isSame(today, "day") && (
            <Button size="small" type="link" onClick={() => onChange("day", span(today, today))}>
              Today
            </Button>
          )}
        </span>
      )}
      {mode === "dates" && (
        <DatePicker.RangePicker
          size="small"
          allowClear={false}
          value={dates ? [dayjs(dates.from), dayjs(dates.to)] : null}
          format="D MMM YYYY"
          onChange={(v) => v?.[0] && v[1] && onChange("dates", span(v[0], v[1]))}
          presets={[
            { label: "This week", value: [startOfWeek, today] },
            { label: "Last week", value: [startOfWeek.subtract(7, "day"), startOfWeek.subtract(1, "day")] },
            { label: "Last 7 days", value: [today.subtract(6, "day"), today] },
            { label: "This month", value: [today.startOf("month"), today] },
            { label: "Last month", value: [today.subtract(1, "month").startOf("month"), today.subtract(1, "month").endOf("month").startOf("day")] },
            { label: "Last 30 days", value: [today.subtract(29, "day"), today] },
            { label: "This year", value: [today.startOf("year"), today] },
          ]}
          style={{ width: 230 }}
        />
      )}
    </span>
  );
}
