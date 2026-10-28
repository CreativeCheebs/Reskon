import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { CardConfig, Status, Task, View } from "../types";
import { TaskCard } from "./TaskCard";
import { Composer } from "./Composer";

interface Props {
  status: Status;
  taskIds: number[];
  byId: Map<number, Task>;
  config: CardConfig;
  disabled: boolean;
  view: View;
  onOpenTask: (id: number) => void;
  onCreated: (t: Task) => void;
}

export function Column({ status, taskIds, byId, config, disabled, view, onOpenTask, onCreated }: Props) {
  const { setNodeRef } = useDroppable({ id: "col-" + status.id, disabled });
  const { behaviourOf } = useApp();
  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        background: palette.panelDim,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        maxHeight: "100%",
      }}
    >
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color ?? palette.muted }} />
        <span style={{ fontWeight: 600 }}>{status.name}</span>
        <span style={{ color: palette.muted }}>{taskIds.length}</span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", minHeight: 40 }}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {taskIds.map((id) => {
              const t = byId.get(id);
              return t ? (
                <SortableCard key={id} task={t} config={config} disabled={disabled} onOpen={() => onOpenTask(id)} />
              ) : null;
            })}
          </div>
        </SortableContext>
      </div>
      {behaviourOf(status.id) !== "done" && behaviourOf(status.id) !== "cancelled" && (
        <div style={{ padding: "0 8px 8px" }}>
          <Composer statusId={status.id} view={view} onCreated={onCreated} />
        </div>
      )}
    </div>
  );
}

function SortableCard({
  task,
  config,
  disabled,
  onOpen,
}: {
  task: Task;
  config: CardConfig;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} config={config} onOpen={onOpen} />
    </div>
  );
}
