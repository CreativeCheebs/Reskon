import { useState } from "react";
import { Form, Select } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { defaultPriorityId } from "../task/defaultPriority";
import { useTerms } from "../terms";

// The `default_priority` setting: the priority a new task gets when none is
// chosen (board, task panel, quick capture, phone). None leaves it empty.
// Saves on change.

const NONE = 0;

export function DefaultPrioritySettings() {
  const T = useTerms();
  const { boot, saveSetting, online } = useApp();
  const [value, setValue] = useState<number>(defaultPriorityId(boot.settings, boot.priorities) ?? NONE);
  const save = (v: number) => {
    const before = value;
    setValue(v);
    autosave(saveSetting("default_priority", { priority_id: v === NONE ? null : v })).catch(() => setValue(before));
  };
  const sorted = [...boot.priorities].sort((a, b) => a.position - b.position);
  return (
    <div style={{ maxWidth: 560 }}>
      <Form layout="vertical" size="small" disabled={!online}>
        <Form.Item label="Default priority" extra={`New ${T.tasks} start with this priority. Change it on any ${T.task} afterwards.`}>
          <Select
            value={value}
            onChange={save}
            style={{ width: 220 }}
            options={[{ value: NONE, label: "None" }, ...sorted.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Form.Item>
      </Form>
    </div>
  );
}
