import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type Announcements,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { cardConfigOf } from "../views/cardConfig";
import type { ColumnLimit, Status, Task, View } from "../types";
import { confirm } from "../theme/feedback";
import { formatLimit, limitWeight } from "./limits";
import { today } from "../format";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import { COL_GAP } from "./useBoardFit";
import { boardComparator } from "./sorting";
import { useTerms } from "../terms";

// One row of status columns with drag and drop. Without grouping the board
// is a single lane; grouped, each group (epic, priority ...) is a lane, and
// cards move between columns within their lane. With a sort other than
// manual, cards still move between columns (landing at the end of the
// dragged order) but cannot be reordered within one.

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
  /** This lane's tasks only. */
  tasks: Task[];
  boardStatuses: Status[];
  collapsed: Set<number>;
  onToggleCollapse: (statusId: number) => void;
  limits: Map<number, { limit: ColumnLimit; use: number }>;
  onSetLimit: (statusId: number, limit: ColumnLimit | null) => void;
  inLane: boolean;
  createDefaults: Record<string, unknown>;
  setTasks: (fn: (prev: Task[]) => Task[]) => void;
  refetch: () => void;
  onOpenTask: (id: number) => void;
}

export function Lane(props: Props) {
  const { view, tasks, boardStatuses, collapsed, onToggleCollapse, limits, onSetLimit, inLane, createDefaults, setTasks, refetch, onOpenTask } =
    props;
  const { online, boot } = useApp();
  const T = useTerms();
  const config = useMemo(() => cardConfigOf(view), [view]);
  const sort = view.board_state?.sort ?? "manual";
  const sorted = sort !== "manual";
  const compare = useMemo(() => boardComparator(sort, boot), [sort, boot]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Stable, so memoised cards skip re-rendering.
  const onTaskChanged = useCallback((t: Task) => setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x))), [setTasks]);
  const onTaskDeleted = useCallback((id: number) => setTasks((prev) => prev.filter((x) => x.id !== id)), [setTasks]);

  const buildColumns = useCallback((): Columns => {
    const cols: Columns = {};
    for (const s of boardStatuses) cols[s.id] = [];
    for (const t of [...tasks].sort(compare)) {
      if (cols[t.status_id]) cols[t.status_id].push(t.id);
    }
    return cols;
  }, [tasks, boardStatuses, compare]);

  const [columns, setColumnsState] = useState<Columns>(buildColumns);
  // The newest columns, even before the board redraws. Drag events can come
  // faster than redraws; read from `columns`, a drop saw the board a frame
  // old and a card dragged straight back landed where it had been.
  const latest = useRef(columns);
  const setColumns = useCallback((next: Columns | ((prev: Columns) => Columns)) => {
    const value = typeof next === "function" ? next(latest.current) : next;
    latest.current = value;
    setColumnsState(value);
  }, []);
  const [activeId, setActiveId] = useState<number | null>(null);
  useEffect(() => {
    if (activeId === null) setColumns(buildColumns());
  }, [buildColumns, activeId, setColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter is for opening the task, so only Space picks a card up.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // Container ids are "col-<statusId>"; card ids are task ids (numbers).
  const containerOf = (id: string | number, cols: Columns = latest.current): number | undefined => {
    if (typeof id === "string" && id.startsWith("col-")) return Number(id.slice(4));
    for (const [sid, ids] of Object.entries(cols)) if (ids.includes(Number(id))) return Number(sid);
    return undefined;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(Number(e.active.id));

  // What a screen reader says while a card is moved with the keyboard. Without
  // this it would read internal ids ("col-3") instead of titles and statuses.
  const titleOf = (id: string | number) => byId.get(Number(id))?.title ?? `the ${T.task}`;
  const placeOf = (id: string | number) => boardStatuses.find((st) => st.id === containerOf(id))?.name ?? "the board";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${placeOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped in ${placeOf(over.id)}.` : `${titleOf(active.id)} dropped where it was.`),
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} cancelled.`,
  };

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
      // Work from prev, not from `from`: drag-over events can come faster than
      // the screen redraws, and `from` is then a frame old. Taken from it, the
      // card was added to the new column twice; when the copy went, it took the
      // card's drag registration with it, and the card could no longer be
      // picked up (a press opened the task instead).
      const id = Number(active.id);
      if (prev[to]?.includes(id)) return prev;
      const next: Columns = {};
      for (const [sid, ids] of Object.entries(prev)) next[Number(sid)] = ids.filter((x) => x !== id);
      const toIds = next[to] ?? [];
      const overIndex = toIds.indexOf(Number(over.id));
      // Over the lower half of a card: land below it, not above.
      const dragged = active.rect.current.translated;
      const below = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
      toIds.splice(overIndex >= 0 ? overIndex + (below ? 1 : 0) : toIds.length, 0, id);
      next[to] = toIds;
      return next;
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    // The columns as the drag left them, taken first: once the drag is over,
    // the board resets its columns from the saved tasks (the effect above),
    // which can happen before the code below runs (and always while the
    // limit question is open).
    const snap = latest.current;
    setActiveId(null);
    if (!over) {
      setColumns(buildColumns());
      return;
    }
    const taskId = Number(active.id);
    const to = containerOf(over.id, snap);
    if (to === undefined) return;
    const moving = byId.get(taskId);
    // Where the card was last sent: a move still being saved is not in the
    // saved tasks yet, and a card dragged straight back must not be taken
    // for "not moved".
    const unsaved = (pending.current.get(taskId) ?? 0) > 0;
    const status = sentStatus.current.get(taskId) ?? moving?.status_id;
    // Cancelled: the board has already gone back to the saved columns.
    if (moving && status !== to && !(await withinLimit(moving, to))) return;
    if (sorted) {
      const task = byId.get(taskId);
      setColumns(buildColumns());
      if (!task || status === to) return;
      await send(taskId, { status_id: to, before_id: null, after_id: null });
      return;
    }
    let ids = snap[to];
    const oldIndex = ids.indexOf(taskId);
    const overIndex = ids.indexOf(Number(over.id));
    if (overIndex >= 0 && oldIndex !== overIndex) ids = arrayMove(ids, oldIndex, overIndex);
    setColumns({ ...snap, [to]: ids });

    const i = ids.indexOf(taskId);
    const task = byId.get(taskId);
    const before_id = i > 0 ? ids[i - 1] : null;
    const after_id = i < ids.length - 1 ? ids[i + 1] : null;
    if (!unsaved && task && task.status_id === to && before_id === prevNeighbour(task) && after_id === nextNeighbour(task)) return;
    await send(taskId, { status_id: to, before_id, after_id });
  };

  // A hard limit asks before a card takes its column past it.
  const withinLimit = (t: Task, statusId: number): Promise<boolean> => {
    const l = limits.get(statusId);
    if (!l || !l.limit.hard) return Promise.resolve(true);
    const after = l.use + limitWeight(t, l.limit.unit);
    if (after <= l.limit.max) return Promise.resolve(true);
    const name = boardStatuses.find((s) => s.id === statusId)?.name ?? "This column";
    return new Promise((resolve) =>
      confirm({
        title: `${name} would go over its limit`,
        content: `It would hold ${formatLimit(after, l.limit.unit)}; the limit is ${formatLimit(l.limit.max, l.limit.unit)}. Move it anyway?`,
        okText: "Move anyway",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    );
  };

  // Moves go to the server one at a time, in the order they were made: sent
  // together, two quick moves of one card could be saved in the wrong order
  // and the card would end where it was before the last drop.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The newest move of each card; an older move's answer is not shown, so a
  // card dragged across and straight back does not flick between columns.
  const lastMove = useRef(new Map<number, number>());
  const moveSeq = useRef(0);
  // Per card: moves not answered yet, and the column of the newest one sent.
  const pending = useRef(new Map<number, number>());
  const sentStatus = useRef(new Map<number, number>());
  const send = (taskId: number, body: { status_id: number; before_id: number | null; after_id: number | null }) => {
    const n = ++moveSeq.current;
    lastMove.current.set(taskId, n);
    pending.current.set(taskId, (pending.current.get(taskId) ?? 0) + 1);
    sentStatus.current.set(taskId, body.status_id);
    const run = async () => {
      try {
        // A move that never answers must not hold up every later one.
        const reply = api.post<Task & { column_renumbered?: boolean }>(`/tasks/${taskId}/move`, { ...body, today: today() });
        const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("The move took too long; the board was reloaded.")), 15_000));
        const { column_renumbered, ...updated } = await Promise.race([reply, timeout]);
        if (lastMove.current.get(taskId) === n) setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        // The server made room by renumbering the column: reload the others.
        if (column_renumbered) refetch();
      } catch (err) {
        message.error(String((err as Error).message));
        refetch();
      } finally {
        const left = (pending.current.get(taskId) ?? 1) - 1;
        if (left > 0) pending.current.set(taskId, left);
        else {
          pending.current.delete(taskId);
          sentStatus.current.delete(taskId);
        }
      }
    };
    const p = queue.current.then(run);
    queue.current = p;
    return p;
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
    <DndContext
        sensors={sensors}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: `Press Space to pick up this ${T.task}, the arrow keys to move it, Space to drop it and Escape to cancel. Press Enter to open it.`,
          },
        }}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(buildColumns());
        }}
      >
      <div style={{ display: "flex", gap: COL_GAP, flex: inLane ? undefined : "none", minHeight: 0, alignItems: inLane ? "flex-start" : undefined }}>
        {boardStatuses.map((s) => (
          <Column
            key={s.id}
            status={s}
            taskIds={columns[s.id] ?? []}
            byId={byId}
            config={config}
            disabled={!online}
            view={view}
            collapsed={collapsed.has(s.id)}
            onToggleCollapse={() => onToggleCollapse(s.id)}
            limit={limits.get(s.id)}
            onSetLimit={(l) => onSetLimit(s.id, l)}
            inLane={inLane}
            createDefaults={createDefaults}
            onOpenTask={onOpenTask}
            onCreated={(t) => setTasks((prev) => [...prev, t])}
            onTaskChanged={onTaskChanged}
            onTaskDeleted={onTaskDeleted}
          />
        ))}
      </div>
      {/* No drop animation: while it ran (a quarter second), a card picked up
          again landed in the wrong column. The card now sits where it was dropped at once. */}
      <DragOverlay dropAnimation={null}>{active ? <TaskCard task={active} config={config} /> : null}</DragOverlay>
    </DndContext>
  );
}
