import { useState } from "react";
import { Checkbox, Typography } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { COMPLETENESS_FIELDS, requiredFields } from "../task/completeness";

// The `task_completeness` setting: the fields an open task needs before
// its details count as complete. Nothing ticked (the default) means every
// task is complete. Saves on change.

export function CompletenessSettings() {
  const { boot, saveSetting, online } = useApp();
  const [required, setRequired] = useState<string[]>(requiredFields(boot.settings));
  const save = (next: string[]) => {
    const before = required;
    // Keep the list's order, whatever order they were ticked in.
    const ordered = COMPLETENESS_FIELDS.map((f) => f.key).filter((k) => next.includes(k));
    setRequired(ordered);
    autosave(saveSetting("task_completeness", { required: ordered })).catch(() => setRequired(before));
  };
  return (
    <div style={{ maxWidth: 560 }}>
      <Checkbox.Group
        disabled={!online}
        value={required}
        onChange={(v) => save(v as string[])}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 16px" }}
        options={COMPLETENESS_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "12px 0 0" }}>
        {required.length
          ? "Open tasks missing any of these are listed under Incomplete beside Backlog, Cancelled and Snoozed."
          : "Nothing is required, so every task counts as complete."}
      </Typography.Paragraph>
    </div>
  );
}
