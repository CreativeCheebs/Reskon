import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tooltip } from "antd";
import { useApp } from "../store";
import { blend, palette } from "../theme/palette";
import type { CardConfig, Status, Task, View } from "../types";
import { TaskCard } from "./TaskCard";
import { Composer } from "./Composer";
import { COLLAPSED_W, COL_MIN } from "./useBoardFit";
import { useSurfaceOpacity, withAlpha } from "../views/ViewBackdrop";

// Columns sit half way between the page and the sunken well, with a faint
// outline, so a mostly empty column reads as space rather than a dark slab.
// Over a view's background image they let it show through (see ViewBackdrop).
const columnBg = (surface: number) => withAlpha(blend(palette.panelDim, palette.bg, 0.5), surface);
const columnBorder = (surface: number) => withAlpha(blend(palette.border, palette.bg, 0.6), Math.max(surface, 0.5));

interface Props {
  status: Status;
  taskIds: number[];
  byId: Map<number, Task>;
  config: CardConfig;
  disabled: boolean;
  view: View;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** In swimlanes, columns size to their cards instead of filling the screen. */
  inLane: boolean;
  createDefaults: Record<string, unknown>;
  onOpenTask: (id: number) => void;
  onCreated: (t: Task) => void;
}

export function Column(props: Props) {
  const { status, taskIds, byId, config, disabled, view, collapsed, onToggleCollapse, inLane, createDefaults, onOpenTask, onCreated } =
    props;
  const { setNodeRef, isOver } = useDroppable({ id: "col-" + status.id, disabled });
  const { behaviourOf } = useApp();
  const surface = useSurfaceOpacity();
  const dot = <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color ?? palette.muted, flex: "none" }} />;

  // Collapsed: a narrow strip that still accepts drops (they land at the end).
  if (collapsed)
    return (
      <div
        ref={setNodeRef}
        style={{
          width: COLLAPSED_W,
          flex: "none",
          boxSizing: "border-box",
          background: isOver ? palette.border : columnBg(surface),
          border: `1px solid ${columnBorder(surface)}`,
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "8px 0",
          gap: 8,
          maxHeight: inLane ? 240 : "100%",
          cursor: "pointer",
        }}
        onClick={onToggleCollapse}
        title={`Expand ${status.name}`}
      >
        {dot}
        <span style={{ color: palette.muted, fontSize: 11 }}>{taskIds.length}</span>
        <span style={{ writingMode: "vertical-rl", fontWeight: 600, whiteSpace: "nowrap" }}>{status.name}</span>
      </div>
    );

  return (
    <div
      style={{
        width: `var(--col-w, ${COL_MIN}px)`,
        flex: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        background: columnBg(surface),
        border: `1px solid ${columnBorder(surface)}`,
        borderRadius: 6,
        maxHeight: inLane ? undefined : "100%",
      }}
    >
      <div style={{ padding: "6px 6px 6px 10px", display: "flex", alignItems: "center", gap: 8, minHeight: 36, boxSizing: "border-box" }}>
        {dot}
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            color: palette.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={status.name}
        >
          {status.name}
        </span>
        <span style={{ color: palette.subtle, fontSize: 12 }}>{taskIds.length}</span>
        <span style={{ flex: 1 }} />
        <Tooltip title="Collapse column" mouseEnterDelay={0.5}>
          <Button size="small" type="text" onClick={onToggleCollapse} aria-label={`Collapse ${status.name}`} style={{ color: palette.muted }}>
            ⇤
          </Button>
        </Tooltip>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: inLane ? undefined : "auto", padding: "0 8px 8px", minHeight: 40 }}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {taskIds.map((id) => {
              const t = byId.get(id);
              return t ? <SortableCard key={id} task={t} config={config} disabled={disabled} onOpenTask={onOpenTask} /> : null;
            })}
          </div>
        </SortableContext>
      </div>
      {behaviourOf(status.id) !== "done" && behaviourOf(status.id) !== "cancelled" && (
        <div style={{ padding: "4px 8px 8px", borderTop: `1px solid ${columnBorder(surface)}` }}>
          <Composer statusId={status.id} view={view} defaults={createDefaults} onCreated={onCreated} />
        </div>
      )}
    </div>
  );
}

// Memoised: a card re-renders only when its own task (or the card settings)
// changes, not whenever anything else on the board does.
const SortableCard = memo(function SortableCard({
  task,
  config,
  disabled,
  onOpenTask,
}: {
  task: Task;
  config: CardConfig;
  disabled: boolean;
  onOpenTask: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} config={config} onOpen={() => onOpenTask(task.id)} />
    </div>
  );
});
