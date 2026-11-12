import { Modal, Table } from "antd";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { Lozenge } from "../theme/Lozenge";
import { snoozeTask, wakeLabel } from "../task/SnoozeButton";
import { useColumnWidths } from "./useColumnWidths";
import type { Task } from "../types";
import { useTerms } from "../terms";

// The view's snoozed tasks, beside the hidden statuses in the toolbar.
// Escape closes it; it is not a route. Waking puts a task back where it was.

interface Props {
  tasks: Task[];
  onClose: () => void;
  onChanged: (t: Task) => void;
  onOpenTask: (id: number) => void;
}

export function SnoozedOverlay({ tasks, onClose, onChanged, onOpenTask }: Props) {
  const app = useApp();
  const T = useTerms();
  const rows = tasks.filter((t) => t.snoozed);
  const areaName = (id: number) => app.boot.areas.find((a) => a.id === id)?.name ?? "";

  const wake = async (t: Task) => {
    try {
      onChanged(await snoozeTask(t.id, 0));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const sized = useColumnWidths<Task>("snoozed", [
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
    { key: "area", title: "Area", width: 120, render: (_, t) => areaName(t.area_id) },
    {
      key: "until",
      title: "Back on",
      width: 110,
      sorter: (a, b) => (a.snoozed_until ?? "").localeCompare(b.snoozed_until ?? ""),
      defaultSortOrder: "ascend",
      render: (_, t) => wakeLabel(t),
    },
    {
      title: "",
      width: 100,
      render: (_, t) => (
        <WriteButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            wake(t);
          }}
        >
          Wake now
        </WriteButton>
      ),
    },
  ]);

  return (
    <Modal open title={`Snoozed · ${rows.length}`} onCancel={onClose} footer={null} width={820} keyboard>
      <Table<Task>
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ y: 480 }}
        locale={{ emptyText: `Nothing snoozed. Snooze any open ${T.task} from its panel.` }}
        onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
        columns={sized.columns}
        components={sized.components}
        tableLayout="fixed"
      />
    </Modal>
  );
}
