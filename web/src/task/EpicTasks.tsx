import { useEffect, useState } from "react";
import { Button, Checkbox, Divider, Popover, Space, Spin, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { formatHours } from "../format";
import { palette } from "../theme/palette";
import { DEFAULT_SHOW, SHOW_LABELS } from "../views/cardConfig";
import { TaskTable } from "../views/TaskTable";
import type { CardConfig, CardShow, Task } from "../types";

// The tasks in an epic, as a table, under the epic's own fields. Totals are
// the epic's derived values from the server; the column choice is one
// setting shared by every epic panel.

const SETTING = "epic_columns";
const DEFAULT_COLUMNS: CardShow = { ...DEFAULT_SHOW, status: true, logged: true, epic: false };

interface Props {
  epic: Task;
  /** Bumped when a task in the list changed, to load it again. */
  version: number;
  onOpenTask: (id: number) => void;
}

export function EpicTasks({ epic, version, onOpenTask }: Props) {
  const { boot, online, saveSetting } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const saved = boot.settings[SETTING] as Partial<CardShow> | undefined;
  const show: CardShow = { ...DEFAULT_COLUMNS, ...saved, epic: false };
  const config: CardConfig = { show, density: "compact", icons_only: false };

  useEffect(() => {
    api
      .get<Task[]>(`/tasks?epic=${epic.id}`)
      .then(setTasks)
      .catch((e) => online && message.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epic.id, version]);

  const setShow = (k: keyof CardShow, v: boolean) =>
    saveSetting(SETTING, { ...show, [k]: v }).catch((e) => message.error((e as Error).message));

  const columns = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", width: 300 }}>
      {(Object.keys(SHOW_LABELS) as (keyof typeof SHOW_LABELS)[])
        .filter((k) => k !== "epic")
        .map((k) => (
          <Checkbox key={k} checked={show[k]} disabled={!online} onChange={(e) => setShow(k, e.target.checked)}>
            {SHOW_LABELS[k]}
          </Checkbox>
        ))}
    </div>
  );

  return (
    <>
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Tasks in this epic
      </Divider>
      <Space size={16} wrap style={{ fontSize: 13 }}>
        <Total label="Logged" value={formatHours(epic.epic_logged_h ?? 0)} />
        {!!epic.epic_estimate_h && <Total label="Estimated" value={formatHours(epic.epic_estimate_h)} />}
        <Total label="Done" value={`${epic.epic_done ?? 0} of ${epic.epic_tasks ?? 0}`} />
        <Popover trigger="click" placement="bottomRight" title="Columns" content={columns}>
          <Button size="small">Columns</Button>
        </Popover>
      </Space>
      {!tasks ? (
        <Spin />
      ) : tasks.length === 0 ? (
        <Typography.Text type="secondary">No tasks yet. Pick this epic on a task to add it here.</Typography.Text>
      ) : (
        <TaskTable tasks={tasks} config={config} widthsKey="epic" onOpenTask={onOpenTask} />
      )}
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span style={{ color: palette.muted }}>{label}</span> <strong>{value}</strong>
    </span>
  );
}
