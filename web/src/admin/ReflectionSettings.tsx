import { Form, InputNumber, Select } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";

// Settings the Phase 2 reflection views read. Defaults are guesses until
// there are a few weeks of logs; changing them is a setting, not a rebuild.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function ReflectionSettings() {
  const { boot, saveSetting, online } = useApp();
  const save = (key: string, value: unknown) => autosave(saveSetting(key, value)).catch(() => undefined);
  return (
    <Form layout="vertical" size="small" style={{ maxWidth: 420 }} disabled={!online}>
      <Form.Item label="Weeks start on" extra="Every chart grouped by week follows this.">
        <Select
          value={Number(boot.settings.week_start ?? 1)}
          onChange={(v) => save("week_start", v)}
          options={DAYS.map((d, i) => ({ value: i + 1, label: d }))}
        />
      </Form.Item>
      <Form.Item label="Drift counts" extra="The energy types whose hours Drift adds up for a day. Any type can be in or out.">
        <Select
          mode="multiple"
          placeholder="None"
          value={(Array.isArray(boot.settings.drift_energy_types) ? (boot.settings.drift_energy_types as number[]) : []).filter((id) =>
            boot.energy_types.some((e) => e.id === id),
          )}
          onChange={(v: number[]) => save("drift_energy_types", v)}
          options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
        />
      </Form.Item>
      <Form.Item label="Low day, for Drift" extra="A day with fewer hours than this, across the types above, counts towards the Drift widget's run.">
        <InputNumber
          min={0}
          max={24}
          step={0.5}
          addonAfter="hours"
          value={Number(boot.settings.drift_low_hours ?? 1)}
          onChange={(v) => v !== null && save("drift_low_hours", v)}
        />
      </Form.Item>
    </Form>
  );
}
