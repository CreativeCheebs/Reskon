import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { cardConfigOf, filterOf } from "../views/cardConfig";
import { palette } from "../theme/palette";
import type { Task, View } from "../types";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";

// Columns are on_board statuses only. Hidden statuses (Backlog, Cancelled,
// anything with on_board = 0) are reached by header buttons.

type Columns = Record<number, number[]>; // status id -> task ids in order

// Whatever is under the pointer wins, a card over the column it sits in.
// Plain closestCorners misfires on an empty column: its drop zone spans the
// whole column height, so its far corners make the dragged card's own
// starting slot look closer and the drop silently does nothing.
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    const card = within.find((c) => !String(c.id).startsWith("col-"));
    return card ? [card] : within;
  }
  return closestCorners(args);
};

interface Props {
  view: View;
  tasks: Task[];
  setTasks: (fn: (prev: Task[]) => Task[]) => void;
  refetch: () => void;
  onOpenTask: (id: number) => void;
  onOpenHidden: (statusId: number) => void;
}

export function Board({ view, tasks, setTasks, refetch, onOpenTask, onOpenHidden }: Props) {
  const app = useApp();
  const { boot, online } = app;
  const config = cardConfigOf(view);
  const filter = filterOf(view);

  const boardStatuses = useMemo(
    () =>
      boot.statuses
        .filter((s) => s.on_board && (!filter.statuses || filter.statuses.includes(s.id)))
        .sort((a, b) => a.position - b.position),
    [boot.statuses, filter.statuses],
  );
  const hiddenStatuses = boot.statuses.filter((s) => !s.on_board).sort((a, b) => a.position - b.position);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const buildColumns = useCallback((): Columns => {
    const cols: Columns = {};
    for (const s of boardStatuses) cols[s.id] = [];
    for (const t of [...tasks].sort((a, b) => a.board_pos - b.board_pos)) {
      if (cols[t.status_id]) cols[t.status_id].push(t.id);
    }
    return cols;
  }, [tasks, boardStatuses]);

  const [columns, setColumns] = useState<Columns>(buildColumns);
  const [activeId, setActiveId] = useState<number | null>(null);
  useEffect(() => {
    if (activeId === null) setColumns(buildColumns());
  }, [buildColumns, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Container ids are "col-<statusId>"; card ids are task ids (numbers).
  const containerOf = (id: string | number): number | undefined => {
    if (typeof id === "string" && id.startsWith("col-")) return Number(id.slice(4));
    for (const [sid, ids] of Object.entries(columns)) if (ids.includes(Number(id))) return Number(sid);
    return undefined;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(Number(e.active.id));

  // Moving across columns while dragging, so the card previews in place.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = containerOf(active.id);
    const to = containerOf(over.id);
    if (from === undefined || to === undefined) return;
    // Pointer in a column's empty space below its cards: preview at the end.
    if (from === to) {
      if (String(over.id).startsWith("col-")) {
        setColumns((prev) => {
          const ids = prev[to].filter((id) => id !== Number(active.id));
          if (prev[to][prev[to].length - 1] === Number(active.id)) return prev;
          return { ...prev, [to]: [...ids, Number(active.id)] };
        });
      }
      return;
    }
    setColumns((prev) => {
      const fromIds = prev[from].filter((id) => id !== Number(active.id));
      const toIds = [...prev[to]];
      const overIndex = toIds.indexOf(Number(over.id));
      // Over the lower half of a card: land below it, not above.
      const dragged = active.rect.current.translated;
      const below = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
      toIds.splice(overIndex >= 0 ? overIndex + (below ? 1 : 0) : toIds.length, 0, Number(active.id));
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) {
      setColumns(buildColumns());
      return;
    }
    const taskId = Number(active.id);
    const to = containerOf(over.id);
    if (to === undefined) return;
    let ids = columns[to];
    const oldIndex = ids.indexOf(taskId);
    const overIndex = ids.indexOf(Number(over.id));
    if (overIndex >= 0 && oldIndex !== overIndex) ids = arrayMove(ids, oldIndex, overIndex);
    setColumns((prev) => ({ ...prev, [to]: ids }));

    const i = ids.indexOf(taskId);
    const task = byId.get(taskId);
    const before_id = i > 0 ? ids[i - 1] : null;
    const after_id = i < ids.length - 1 ? ids[i + 1] : null;
    if (task && task.status_id === to && before_id === prevNeighbour(task) && after_id === nextNeighbour(task)) return;
    try {
      const updated = await api.post<Task>(`/tasks/${taskId}/move`, { status_id: to, before_id, after_id });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      // Renormalisation may have renumbered neighbours; refetch quietly.
      refetch();
    } catch (err) {
      message.error(String((err as Error).message));
      refetch();
    }
  };

  // Neighbours as currently persisted, to skip no-op drops.
  const persisted = buildColumns();
  const prevNeighbour = (t: Task) => {
    const ids = persisted[t.status_id] ?? [];
    const i = ids.indexOf(t.id);
    return i > 0 ? ids[i - 1] : null;
  };
  const nextNeighbour = (t: Task) => {
    const ids = persisted[t.status_id] ?? [];
    const i = ids.indexOf(t.id);
    return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  };

  const active = activeId !== null ? byId.get(activeId) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 8, padding: "0 0 10px", alignItems: "center" }}>
        <div style={{ flex: 1 }} />
        {hiddenStatuses.map((s) => (
          <Button key={s.id} size="small" onClick={() => onOpenHidden(s.id)}>
            {s.name} <span style={{ color: palette.muted }}>{tasks.filter((t) => t.status_id === s.id).length}</span>
          </Button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(buildColumns());
        }}
      >
        <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0, overflowX: "auto" }}>
          {boardStatuses.map((s) => (
            <Column
              key={s.id}
              status={s}
              taskIds={columns[s.id] ?? []}
              byId={byId}
              config={config}
              disabled={!online}
              view={view}
              onOpenTask={onOpenTask}
              onCreated={(t) => setTasks((prev) => [...prev, t])}
            />
          ))}
        </div>
        <DragOverlay>{active ? <TaskCard task={active} config={config} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
