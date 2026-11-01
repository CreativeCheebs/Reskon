import { useState } from "react";
import { Form, InputNumber } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { snoozeMaxDays } from "../task/SnoozeButton";

// The `snooze` setting: the most days a task can be snoozed for. The server
// enforces it when a task is snoozed. Saves on change.

export function SnoozeSettings() {
  const { boot, saveSetting, online } = useApp();
  const [max, setMax] = useState(snoozeMaxDays(boot.settings));
  const save = (v: number | null) => {
    if (!v || v === max) return;
    const before = max;
    setMax(v);
    autosave(saveSetting("snooze", { max_days: v })).catch(() => setMax(before));
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form layout="vertical" size="small" disabled={!online}>
        <Form.Item label="Longest snooze" extra="From 1 to 365 days. Tasks already snoozed keep their date.">
          <InputNumber min={1} max={365} precision={0} value={max} onChange={save} addonAfter="days" style={{ width: 160 }} />
        </Form.Item>
      </Form>
    </div>
  );
}
