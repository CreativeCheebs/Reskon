import { Modal, Table } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { firstBoardTodoStatus, useApp } from "../store";
import { WriteButton } from "../offline";
import { formatAge, today } from "../format";
import { useColumnWidths } from "../views/useColumnWidths";
import type { Task } from "../types";

// Overlay for a hidden (on_board = 0) status such as Backlog. Escape closes
// it; it is not a route. Nothing here is specific to Backlog.

interface Props {
  statusId: number;
  tasks: Task[];
  onClose: () => void;
  onMoved: (t: Task) => void;
  onOpenTask: (id: number) => void;
}

export function HiddenStatusOverlay({ statusId, tasks, onClose, onMoved, onOpenTask }: Props) {
  const app = useApp();
  const status = app.statusById.get(statusId);
  const target = firstBoardTodoStatus(app);
  const rows = tasks.filter((t) => t.status_id === statusId);
  const areaName = (id: number) => app.boot.areas.find((a) => a.id === id)?.name ?? "";

  const moveToBoard = async (t: Task) => {
    if (!target) return;
    try {
      onMoved(await api.post<Task>(`/tasks/${t.id}/move`, { status_id: target.id, today: today() }));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const sized = useColumnWidths<Task>("hidden-status", [
    { key: "title", title: "Title", dataIndex: "title" },
    { key: "area", title: "Area", width: 120, render: (_, t) => areaName(t.area_id) },
    {
      key: "time",
      title: "Time here",
      width: 100,
      sorter: (a, b) => a.time_in_status_h - b.time_in_status_h,
      defaultSortOrder: "descend",
      render: (_, t) => formatAge(t.time_in_status_h),
    },
    {
      title: "",
      width: 130,
      render: (_, t) => (
        <WriteButton
          size="small"
          disabled={!target}
          onClick={(e) => {
            e.stopPropagation();
            moveToBoard(t);
          }}
        >
          To {target?.name ?? "board"}
        </WriteButton>
      ),
    },
  ]);

  return (
    <Modal open title={`${status?.name ?? "Hidden"} · ${rows.length}`} onCancel={onClose} footer={null} width={760} keyboard>
      <Table<Task>
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ y: 480 }}
        onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
        columns={sized.columns}
        components={sized.components}
        tableLayout="fixed"
      />
    </Modal>
  );
}
