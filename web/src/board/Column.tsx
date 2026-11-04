import { memo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { blend, palette, readable } from "../theme/palette";
import type { CardConfig, ColumnLimit, Status, Task, View } from "../types";
import { ColumnLimitControl } from "./ColumnLimitControl";
import { DoneWindow } from "./DoneWindow";
import { TaskCard } from "./TaskCard";
import { CardActionRail, CardContextMenu, useCardActions, type CardHandlers } from "./CardActions";
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
  limit: { limit: ColumnLimit; use: number } | undefined;
  onSetLimit: (limit: ColumnLimit | null) => void;
  /** In swimlanes, columns size to their cards instead of filling the screen. */
  inLane: boolean;
  createDefaults: Record<string, unknown>;
  onOpenTask: (id: number) => void;
  onCreated: (t: Task) => void;
  /** A card's quick action changed or deleted its task. */
  onTaskChanged: (t: Task) => void;
  onTaskDeleted: (id: number) => void;
}

export function Column(props: Props) {
  const {
    status,
    taskIds,
    byId,
    config,
    disabled,
    view,
    collapsed,
    onToggleCollapse,
    limit,
    onSetLimit,
    inLane,
    createDefaults,
    onOpenTask,
    onCreated,
    onTaskChanged,
    onTaskDeleted,
  } = props;
  const overLimit = !!limit && limit.use > limit.limit.max;
  const { setNodeRef, isOver } = useDroppable({ id: "col-" + status.id, disabled });
  const { behaviourOf } = useApp();
  const surface = useSurfaceOpacity();
  const color = status.color && /^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : palette.muted;
  const dot = <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flex: "none" }} />;
  const behaviour = behaviourOf(status.id);
  const canAdd = behaviour !== "done" && behaviour !== "cancelled";
  // The empty state's "Add task" opens the composer at the foot.
  const [composing, setComposing] = useState(false);
  const pillBg = blend(color, palette.bg, 0.2);

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
          borderTop: `3px solid ${color}`,
          borderRadius: 8,
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
        border: `1px solid ${overLimit ? (limit!.limit.hard ? palette.danger : palette.warn) : columnBorder(surface)}`,
        // The status colour as a slim cap: the column's identity at a glance.
        borderTop: `3px solid ${color}`,
        borderRadius: 8,
        maxHeight: inLane ? undefined : "100%",
      }}
    >
      <div style={{ padding: "3px 4px 3px 12px", display: "flex", alignItems: "center", gap: 8, minHeight: 38, boxSizing: "border-box" }}>
        {dot}
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: palette.fg,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={status.name}
        >
          {status.name}
        </span>
        <span
          aria-label={`${taskIds.length} tasks`}
          style={{
            minWidth: 20,
            height: 18,
            padding: "0 6px",
            boxSizing: "border-box",
            borderRadius: 9,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: "18px",
            textAlign: "center",
            background: pillBg,
            color: readable(color, pillBg),
          }}
        >
          {taskIds.length}
        </span>
        <span style={{ flex: 1 }} />
        <ColumnLimitControl statusName={status.name} limit={limit?.limit} use={limit?.use ?? 0} disabled={disabled} onChange={onSetLimit} />
        <Tooltip title="Collapse column" mouseEnterDelay={0.5}>
          <Button size="small" type="text" className="jb-hit" onClick={onToggleCollapse} aria-label={`Collapse ${status.name}`} style={{ color: palette.muted }}>
            ⇤
          </Button>
        </Tooltip>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: inLane ? undefined : "auto", padding: "2px 8px 8px", minHeight: 40 }}>
        {taskIds.length === 0 && (
          <EmptyColumn
            done={behaviour === "done"}
            isOver={isOver}
            onAdd={canAdd && !disabled ? () => setComposing(true) : undefined}
          />
        )}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {taskIds.map((id) => {
              const t = byId.get(id);
              return t ? (
                <SortableCard
                  key={id}
                  task={t}
                  config={config}
                  disabled={disabled}
                  onOpen={onOpenTask}
                  onChanged={onTaskChanged}
                  onDeleted={onTaskDeleted}
                />
              ) : null;
            })}
          </div>
        </SortableContext>
      </div>
      {canAdd && (
        <div style={{ padding: "4px 8px 8px", borderTop: `1px solid ${columnBorder(surface)}` }}>
          <Composer
            statusId={status.id}
            view={view}
            defaults={createDefaults}
            onCreated={onCreated}
            open={composing}
            onOpenChange={setComposing}
            onOpenTask={onOpenTask}
          />
        </div>
      )}
      {behaviourOf(status.id) === "done" && !inLane && (
        <div style={{ padding: "2px 8px 6px", borderTop: `1px solid ${columnBorder(surface)}` }}>
          <DoneWindow view={view} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

// Memoised: a card re-renders only when its own task (or the card settings)
// changes, not whenever anything else on the board does. Right-click opens
// the actions chosen in Settings → Card actions. The context menu wraps the sortable node rather than sitting
// inside it, so keys and clicks in the menu never reach the drag sensors.
const SortableCard = memo(function SortableCard({
  task,
  config,
  disabled,
  ...handlers
}: {
  task: Task;
  config: CardConfig;
  disabled: boolean;
} & CardHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  const actions = useCardActions(task, handlers);
  return (
    <CardContextMenu actions={actions}>
      <div
        ref={setNodeRef}
        className="jb-sortable"
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
        {...attributes}
        {...listeners}
      >
        <TaskCard
          task={task}
          config={config}
          onOpen={() => handlers.onOpen(task.id)}
          pinned={actions.pinned}
          rail={<CardActionRail task={task} actions={actions} onChanged={handlers.onChanged} />}
        />
      </div>
    </CardContextMenu>
  );
});

/** A small, friendly placeholder for a column with no cards, which also
 *  shows where a dragged card will land. */
function EmptyColumn({ done, isOver, onAdd }: { done: boolean; isOver: boolean; onAdd?: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "18px 10px",
        borderRadius: 8,
        border: `1px dashed ${isOver ? palette.accent : blend(palette.border, palette.bg, 0.8)}`,
        background: isOver ? blend(palette.accent, palette.bg, 0.08) : "transparent",
        color: palette.subtle,
        fontSize: 12,
        textAlign: "center",
        transition: "border-color .12s ease, background-color .12s ease",
      }}
    >
      <span>{done ? "Nothing finished lately" : "No tasks here yet"}</span>
      {isOver ? (
        <span style={{ color: palette.fg }}>Drop to move it here</span>
      ) : onAdd ? (
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAdd}>
          Add task
        </Button>
      ) : (
        <span>Drag a card here</span>
      )}
    </div>
  );
}
