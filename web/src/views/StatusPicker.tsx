import { useState } from "react";
import { Dropdown, type MenuProps } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { today } from "../format";
import { message } from "../theme/feedback";
import { Lozenge } from "../theme/Lozenge";
import type { Task } from "../types";

// A table row's status, as a button that opens the list of statuses, like
// Jira's. Choosing one moves the task the usual way (POST /tasks/:id/move),
// which writes the status history. It is the only thing it does.

export function StatusPicker({ task, onMoved }: { task: Task; onMoved: (t: Task) => void }) {
  const { boot, statusById, online } = useApp();
  const [open, setOpen] = useState(false);
  const current = statusById.get(task.status_id);
  if (!current) return null;
  const statuses = [...boot.statuses].sort((a, b) => a.position - b.position);

  const items: MenuProps["items"] = statuses.map((s) => ({
    key: String(s.id),
    label: s.name,
    icon: <span className="jb-menu-dot" style={/^#[0-9a-fA-F]{6}$/.test(s.color ?? "") ? { background: s.color! } : undefined} />,
    disabled: s.id === task.status_id,
    extra: s.id === task.status_id ? "Now" : undefined,
  }));

  const choose: MenuProps["onClick"] = async ({ key, domEvent }) => {
    // The menu is drawn elsewhere, but React still sends the click up to the
    // row, which would open the task.
    domEvent.stopPropagation();
    setOpen(false);
    try {
      const { column_renumbered: _, ...moved } = await api.post<Task & { column_renumbered?: boolean }>(`/tasks/${task.id}/move`, {
        status_id: Number(key),
        today: today(),
      });
      onMoved(moved);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Dropdown
      trigger={["click"]}
      rootClassName="jb-menu"
      open={open}
      onOpenChange={(v) => setOpen(v && online)}
      menu={{ items, onClick: choose }}
    >
      <button
        type="button"
        aria-label={`Status: ${current.name}. Change status`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={!online}
        title={online ? undefined : "Offline"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Escape closes this list, not a pop-up (the Backlog list) the table is in.
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        style={{ background: "none", border: 0, padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: online ? "pointer" : "default", borderRadius: 4 }}
      >
        <Lozenge color={current.color} strong>
          {current.name}<span aria-hidden> ▾</span>
        </Lozenge>
      </button>
    </Dropdown>
  );
}
