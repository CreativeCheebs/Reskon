import { useState } from "react";
import { Form, Select, Space, Switch, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";

// The `task_dates` setting: which statuses fill in a task's start and end
// date when a task moves into them. The server applies it, inside the move.
// An empty list stands for the default, by behaviour.

interface Rules {
  start_auto: boolean;
  start_statuses: number[] | null;
  end_auto: boolean;
  end_statuses: number[] | null;
}

export function TaskDateSettings() {
  const { boot, behaviourOf, reloadBootstrap } = useApp();
  const saved = (boot.settings.task_dates as Partial<Rules> | undefined) ?? {};
  const statuses = [...boot.statuses].sort((a, b) => a.position - b.position);
  const byBehaviour = (...b: string[]) => statuses.filter((s) => b.includes(behaviourOf(s.id) ?? "")).map((s) => s.id);
  const [rules, setRules] = useState<Rules>({
    start_auto: saved.start_auto ?? true,
    start_statuses: saved.start_statuses ?? byBehaviour("in_progress"),
    end_auto: saved.end_auto ?? true,
    end_statuses: saved.end_statuses ?? byBehaviour("done", "cancelled"),
  });
  const set = (patch: Partial<Rules>) => setRules((r) => ({ ...r, ...patch }));
  const options = (ids: number[]) => statuses.filter((s) => ids.includes(s.id)).map((s) => ({ value: s.id, label: s.name }));
  // A task is finished in a done or cancelled status, so only those can end it.
  const endChoices = byBehaviour("done", "cancelled");
  const startChoices = byBehaviour("todo", "in_progress");

  const save = async () => {
    try {
      await api.put("/settings/task_dates", rules);
      await reloadBootstrap();
      message.success("Saved");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Paragraph type="secondary">
        Start and end dates can always be set by hand in the task panel. Turned on here, a move fills them in with today's date
        when they are empty. Reopening a finished task clears its end date.
      </Typography.Paragraph>
      <Form layout="vertical" size="small">
        <Form.Item label="Start date">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space>
              <Switch checked={rules.start_auto} onChange={(v) => set({ start_auto: v })} />
              <span>{rules.start_auto ? "Set automatically when a task moves into" : "Manual only"}</span>
            </Space>
            {rules.start_auto && (
              <Select
                mode="multiple"
                style={{ width: "100%" }}
                value={rules.start_statuses ?? []}
                onChange={(v: number[]) => set({ start_statuses: v })}
                options={options(startChoices)}
                placeholder="Choose statuses"
                aria-label="Statuses that set the start date"
              />
            )}
          </Space>
        </Form.Item>
        <Form.Item label="End date">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space>
              <Switch checked={rules.end_auto} onChange={(v) => set({ end_auto: v })} />
              <span>{rules.end_auto ? "Set automatically when a task moves into" : "Manual only"}</span>
            </Space>
            {rules.end_auto && (
              <Select
                mode="multiple"
                style={{ width: "100%" }}
                value={rules.end_statuses ?? []}
                onChange={(v: number[]) => set({ end_statuses: v })}
                options={options(endChoices)}
                placeholder="Choose statuses"
                aria-label="Statuses that set the end date"
              />
            )}
          </Space>
        </Form.Item>
        <WriteButton type="primary" onClick={save}>
          Save
        </WriteButton>
      </Form>
    </div>
  );
}
