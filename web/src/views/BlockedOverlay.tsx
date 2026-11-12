import { Modal, Switch, Table } from "antd";
import { useApp } from "../store";
import { Lozenge } from "../theme/Lozenge";
import { useColumnWidths } from "./useColumnWidths";
import type { Task } from "../types";
import { useTerms } from "../terms";

// The view's blocked tasks: open, with an open task still blocking them.
// While the view hides them (the default) they are listed here instead of
// on the board; the switch shows them on the board again.

interface Props {
  tasks: Task[];
  hidden: boolean;
  onHidden: (hide: boolean) => void;
  onClose: () => void;
  onOpenTask: (id: number) => void;
}

export function BlockedOverlay({ tasks, hidden, onHidden, onClose, onOpenTask }: Props) {
  const { statusById, online } = useApp();
  const T = useTerms();
  const rows = tasks.filter((t) => t.blocked);
  const sized = useColumnWidths<Task>("blocked", [
    { key: "title", title: "Title", dataIndex: "title" },
    {
      key: "status",
      title: "Status",
      width: 130,
      render: (_, t) => {
        const s = statusById.get(t.status_id);
        return s ? <Lozenge color={s.color}>{s.name}</Lozenge> : null;
      },
    },
    {
      key: "waiting",
      title: "Waiting on",
      render: (_, t) =>
        t.blocked_by
          .filter((b) => b.behaviour !== "done" && b.behaviour !== "cancelled")
          .map((b) => b.title)
          .join(", "),
    },
  ]);

  return (
    <Modal
      open
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          Blocked · {rows.length}
          <span style={{ marginLeft: "auto", marginRight: 32, fontSize: 13, fontWeight: 400, display: "inline-flex", gap: 8, alignItems: "center" }}>
            Hide them from this view
            <Switch size="small" checked={hidden} disabled={!online} onChange={onHidden} />
          </span>
        </span>
      }
      onCancel={onClose}
      footer={null}
      width={820}
      keyboard
    >
      <Table<Task>
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ y: 480 }}
        locale={{ emptyText: `Nothing blocked. Link ${T.tasks} under Dependencies in the ${T.task}'s panel.` }}
        onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
        columns={sized.columns}
        components={sized.components}
        tableLayout="fixed"
      />
    </Modal>
  );
}
