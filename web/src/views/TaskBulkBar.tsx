import { useState } from "react";
import { Button, Divider, Select } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { message } from "../theme/feedback";
import { palette } from "../theme/palette";
import { today } from "../format";
import type { Task } from "../types";

// Actions on the tasks ticked in a table. Moving goes through one
// all-or-nothing request (POST /api/tasks/move), which writes a transition
// for every task that changes status. Floats at the bottom of the screen so
// it stays in reach however far the table is scrolled.

export function TaskBulkBar({
  ids,
  total,
  onSelectAll,
  onMoved,
  onClear,
}: {
  ids: number[];
  /** How many rows the table shows, for "Select all". */
  total: number;
  onSelectAll: () => void;
  onMoved: (tasks: Task[]) => void;
  onClear: () => void;
}) {
  const { boot, online } = useApp();
  const [busy, setBusy] = useState(false);
  const n = ids.length;
  const plural = `${n} task${n === 1 ? "" : "s"}`;
  const statuses = [...boot.statuses].sort((a, b) => a.position - b.position);

  const move = async (statusId: number) => {
    setBusy(true);
    try {
      const moved = await api.post<Task[]>("/tasks/move", { task_ids: ids, status_id: statusId, today: today() });
      message.success(`${plural} moved to ${statuses.find((s) => s.id === statusId)?.name}`);
      onMoved(moved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Selected tasks"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        padding: "8px 12px",
        background: palette.panel,
        border: `1px solid ${palette.accent}`,
        borderRadius: 8,
        boxShadow: `0 8px 24px ${palette.shadow}`,
      }}
    >
      <span style={{ fontWeight: 600 }}>{plural} selected</span>
      {n < total && (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={onSelectAll}>
          Select all {total}
        </Button>
      )}
      <Divider type="vertical" />
      <Select
        size="small"
        placeholder="Move to status…"
        style={{ width: 170 }}
        value={null}
        disabled={busy || !online}
        loading={busy}
        onChange={(v: number) => move(v)}
        options={statuses.map((s) => ({
          value: s.id,
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color ?? palette.muted }} />
              {s.name}
            </span>
          ),
        }))}
      />
      <Button size="small" type="text" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
