import { Modal, Table, Tag } from "antd";
import { useApp } from "../store";
import { Lozenge } from "../theme/Lozenge";
import { useColumnWidths } from "./useColumnWidths";
import { fieldLabel } from "../task/completeness";
import type { Task } from "../types";

// The view's open tasks that lack details Settings → Complete details asks
// for, each with what is missing. Opening one fills it in from the panel.
// Escape closes it; it is not a route.

export function IncompleteOverlay({ tasks, onClose, onOpenTask }: { tasks: Task[]; onClose: () => void; onOpenTask: (id: number) => void }) {
  const app = useApp();
  const rows = tasks.filter((t) => t.missing.length > 0);
  const sized = useColumnWidths<Task>("incomplete", [
    { key: "title", title: "Title", dataIndex: "title" },
    {
      key: "status",
      title: "Status",
      width: 130,
      render: (_, t) => {
        const s = app.statusById.get(t.status_id);
        return s ? <Lozenge color={s.color}>{s.name}</Lozenge> : null;
      },
    },
    {
      key: "missing",
      title: "Missing",
      width: 300,
      sorter: (a, b) => a.missing.length - b.missing.length,
      defaultSortOrder: "descend",
      render: (_, t) =>
        t.missing.map((k) => (
          <Tag key={k} bordered={false} style={{ marginBlock: 1 }}>
            {fieldLabel(k)}
          </Tag>
        )),
    },
  ]);
  return (
    <Modal open title={`Incomplete details · ${rows.length}`} onCancel={onClose} footer={null} width={820} keyboard>
      <Table<Task>
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ y: 480 }}
        locale={{ emptyText: "Every open task has the details Settings → Complete details asks for." }}
        onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
        columns={sized.columns}
        components={sized.components}
        tableLayout="fixed"
      />
    </Modal>
  );
}
