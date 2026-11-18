import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { message } from "../theme/feedback";
import { palette } from "../theme/palette";
import { minutesText, parseAvailable, readAvailable, WEEKDAYS } from "./plan";
import type { PlanTotals } from "./types";

/**
 * Planner settings: the minutes available on each weekday (blank means not
 * set, so that day never warns) and an override for the day being viewed.
 */
export function PlannerSettings({ day, totals, dayOverride, onDone, onClose }: { day: string; totals: PlanTotals; dayOverride: number | null; onDone: () => void; onClose: () => void }) {
  const { boot, saveSetting, online } = useApp();
  const saved = readAvailable(boot.settings.planner_available);
  const [week, setWeek] = useState<Record<string, string>>(() => Object.fromEntries(WEEKDAYS.map(([k]) => [k, saved[k] === undefined ? "" : minutesText(saved[k])])));
  const [today, setToday] = useState(dayOverride === null ? "" : dayOverride === 0 ? "0" : minutesText(dayOverride));
  const [busy, setBusy] = useState(false);

  const weekParsed = WEEKDAYS.map(([k]) => [k, parseAvailable(week[k])] as const);
  const dayParsed = parseAvailable(today);
  const valid = weekParsed.every(([, v]) => v !== undefined) && dayParsed !== undefined;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const value: Record<string, number> = {};
      for (const [k, v] of weekParsed) if (typeof v === "number") value[k] = v;
      await saveSetting("planner_available", value);
      await api.patch(`/day/${day}`, { available_min: dayParsed ?? null });
      onDone();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
      setBusy(false);
    }
  };

  const field = (id: string, value: string, set: (v: string) => void, parsed: number | null | undefined, placeholder: string) => (
    <Input id={id} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} status={parsed === undefined ? "error" : undefined} aria-invalid={parsed === undefined} style={{ width: 130 }} />
  );

  return (
    <Modal open centered width={420} title="Planner settings" okText="Save" onOk={save} onCancel={onClose} okButtonProps={{ disabled: !valid || !online, loading: busy }}>
      <p style={{ color: palette.muted, fontSize: 12, marginTop: 0 }}>
        Time you have available on each weekday, like 8h or 90. Leave a day blank for “not set” (no warning), or enter 0 for a day off.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "8px 12px", alignItems: "center", justifyContent: "start" }}>
        {WEEKDAYS.map(([k, name], i) => (
          <Row key={k} label={name} id={`avail-${k}`}>
            {field(`avail-${k}`, week[k], (v) => setWeek({ ...week, [k]: v }), weekParsed[i][1], "not set")}
          </Row>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${palette.border}`, margin: "14px 0 10px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label htmlFor="avail-day" style={{ minWidth: 90 }}>
          This day only
        </label>
        {field("avail-day", today, setToday, dayParsed, "use weekday")}
        <Button size="small" type="link" onClick={() => setToday("")} disabled={today === ""}>
          Use weekday
        </Button>
      </div>
      <div style={{ color: palette.muted, fontSize: 12, marginTop: 6 }}>
        {totals.available_min === null ? "No available time applies to this day." : `Now: ${minutesText(totals.available_min)} (${totals.available_from === "day" ? "set for this day" : "from the weekday"}).`}
      </div>
    </Modal>
  );
}

function Row({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {children}
    </>
  );
}
