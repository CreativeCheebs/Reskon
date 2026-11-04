import { Form, Select } from "antd";
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
      {/* Drift's settings (drift_energy_types, drift_low_hours) are hidden
          until Drift is designed in the next phase; the stored values stay. */}
    </Form>
  );
}
