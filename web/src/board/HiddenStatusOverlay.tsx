import { Modal } from "antd";
import type { ColumnsType } from "antd/es/table";
import { message } from "../theme/feedback";
import { api } from "../api";
import { firstBoardTodoStatus, useApp } from "../store";
import { WriteButton } from "../offline";
import { today } from "../format";
import { TaskTable } from "../views/TaskTable";
import type { CardConfig, GroupBy, Task } from "../types";
import type { NextMode } from "../task/nextTask";

// Overlay for a hidden (on_board = 0) status such as Backlog. Escape closes
// it; it is not a route. It is the view's own table (same columns, grouping,
// sorting, status buttons, right-click menu and bulk actions), narrowed to
// that status, so nothing the List layout can do is missing here. Nothing
// here is specific to Backlog.

interface Props {
  statusId: number;
  tasks: Task[];
  /** The view's columns and grouping, as its List layout shows them. */
  config: CardConfig;
  groupBy: GroupBy;
  widthsKey: string;
  onClose: () => void;
  /** Called with the tasks a move changed. */
  onMoved: (tasks: Task[]) => void;
  onDeleted: (ids: number[]) => void;
  onOpenTask: (id: number, next?: NextMode) => void;
}

/** Above the pop-up itself, so its bulk bar can be reached. */
const OVERLAY_Z = 1100;

export function HiddenStatusOverlay({ statusId, tasks, config, groupBy, widthsKey, onClose, onMoved, onDeleted, onOpenTask }: Props) {
  const app = useApp();
  const status = app.statusById.get(statusId);
  const target = firstBoardTodoStatus(app);
  const rows = tasks.filter((t) => t.status_id === statusId);

  const moveToBoard = async (t: Task) => {
    if (!target) return;
    try {
      const { column_renumbered: _, ...moved } = await api.post<Task & { column_renumbered?: boolean }>(`/tasks/${t.id}/move`, {
        status_id: target.id,
        today: today(),
      });
      onMoved([moved]);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // The one extra: a button to bring a task back to the board in one click.
  const toBoard: ColumnsType<Task>[number] = {
    key: "to-board",
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
  };

  return (
    <Modal open title={`${status?.name ?? "Hidden"} · ${rows.length}`} onCancel={onClose} footer={null} width="min(1200px, 94vw)" keyboard>
      <div style={{ maxHeight: "70vh", overflow: "auto" }}>
        <TaskTable
          tasks={rows}
          config={config}
          groupBy={groupBy}
          widthsKey={widthsKey}
          sticky={false}
          bulkZIndex={OVERLAY_Z}
          extraColumn={toBoard}
          onOpenTask={onOpenTask}
          onMoved={onMoved}
          onDeleted={onDeleted}
        />
      </div>
    </Modal>
  );
}
