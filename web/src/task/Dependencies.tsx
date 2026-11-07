import { useState } from "react";
import { Button, Divider, Select, Space, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { LinkedTask, Task, TaskBrief } from "../types";
import { pressable } from "../a11y";

// Dependencies in the task panel, after Jira: what this task is blocked by
// and what it blocks. Whether it is blocked is the server's (task.blocked);
// the server also refuses loops.

type Side = "blocked_by" | "blocks";

interface Props {
  task: Task;
  onOpenTask: (id: number) => void;
  /** A link was added or removed: load the task again. */
  onChanged: () => void;
}

export function Dependencies({ task, onOpenTask, onChanged }: Props) {
  const { online } = useApp();
  const [briefs, setBriefs] = useState<TaskBrief[] | null>(null);
  const [side, setSide] = useState<Side>("blocked_by");
  const load = () => !briefs && api.get<TaskBrief[]>("/tasks?brief=1").then(setBriefs).catch(() => undefined);

  const add = async (other: number) => {
    const body = side === "blocked_by" ? { blocker_id: other, blocked_id: task.id } : { blocker_id: task.id, blocked_id: other };
    try {
      await api.post("/task-links", body);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const remove = async (l: LinkedTask) => {
    try {
      await api.del(`/task-links/${l.link_id}`);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const linked = new Set([...task.blocked_by, ...task.blocks].map((l) => l.id));
  const rows = (label: string, list: LinkedTask[]) =>
    list.length > 0 && (
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
        {list.map((l) => {
          const finished = l.behaviour === "done" || l.behaviour === "cancelled";
          return (
            <div key={l.link_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px" }}>
              <span
                {...pressable(() => onOpenTask(l.id))}
                style={{ cursor: "pointer", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: finished ? palette.muted : palette.fg, textDecoration: finished ? "line-through" : undefined }}
              >
                {l.title}
              </span>
              <StatusName id={l.status_id} />
              <Button size="small" type="text" icon={<CloseOutlined />} disabled={!online} onClick={() => remove(l)} aria-label={`Remove the link to ${l.title}`} />
            </div>
          );
        })}
      </div>
    );

  return (
    <>
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Dependencies{task.blocked ? " · blocked" : ""}
      </Divider>
      {rows("Blocked by", task.blocked_by)}
      {rows("Blocks", task.blocks)}
      <Space.Compact size="small" style={{ width: "100%" }}>
        <Select<Side>
          value={side}
          onChange={setSide}
          style={{ width: 130 }}
          disabled={!online}
          options={[
            { value: "blocked_by", label: "Blocked by" },
            { value: "blocks", label: "Blocks" },
          ]}
        />
        <Select<number>
          showSearch
          placeholder="Pick a task"
          style={{ flex: 1 }}
          disabled={!online}
          value={null}
          optionFilterProp="search"
          loading={!briefs}
          onDropdownVisibleChange={(open) => open && load()}
          onChange={add}
          options={(briefs ?? [])
            .filter((b) => b.id !== task.id && !linked.has(b.id) && b.behaviour !== "cancelled")
            .map((b) => ({ value: b.id, search: b.title.toLowerCase(), label: b.title }))}
        />
      </Space.Compact>
    </>
  );
}

function StatusName({ id }: { id: number }) {
  const { statusById } = useApp();
  return <span style={{ color: palette.muted, fontSize: 12, flex: "none" }}>{statusById.get(id)?.name}</span>;
}
