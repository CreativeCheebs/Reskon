import { useMemo, useRef, useState } from "react";
import { Empty } from "antd";
import { useApp } from "../store";
import { blend, palette, readable } from "../theme/palette";
import { columnBg, columnBorder } from "../board/columnStyle";
import { TaskCard } from "../board/TaskCard";
import { CardActionRail, CardContextMenu, useCardActions } from "../board/CardActions";
import { TaskPanel } from "../task/TaskPanel";
import { DEFAULT_SHOW } from "../views/cardConfig";
import { useTerms } from "../terms";
import type { CardConfig, Task, View } from "../types";
import { openColumns, type OpenColumn } from "./boardColumns";

// A board widget's body: the view's open tasks as small columns of the
// board's own cards. Cards open the task panel, and have the board's hover
// buttons and right-click menu (Settings > Card actions), which can log time,
// snooze, edit the note, move to another status or delete. Nothing drags
// (a status changes through Move to). All of it is off while the dashboard
// layout is edited. The task key is never shown, as on the board.

// Only what helps you choose what to do next; the view's own card settings
// would make cards too tall for a widget.
const CARD: CardConfig = {
  density: "compact",
  icons_only: false,
  show: {
    ...DEFAULT_SHOW,
    time_in_status: false,
    subtypes: false,
    estimate: false,
    progress_bar: false,
    pace: false,
    epic: false,
    tags: false,
    priority: true,
    difficulty: true,
    due: true,
  },
};

export function ViewBoardBody({ view, tasks, editing, refetch }: { view: View; tasks: Task[]; editing: boolean; refetch: () => void }) {
  const { boot, behaviourOf } = useApp();
  const columns = useMemo(() => openColumns(view, tasks, boot, behaviourOf), [view, tasks, boot, behaviourOf]);
  const [open, setOpen] = useState<number | null>(null);
  const changed = useRef(false);
  // While editing the layout a click must not open a panel: the widget is for dragging.
  const onOpen = editing ? undefined : setOpen;
  const nothing = columns.length === 0 || columns.every((c) => c.count === 0);

  // The panel is drawn whatever the columns hold: a live reload that empties
  // them (the open task moved on) must not unmount it without its onClose.
  return (
    <>
      {nothing ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={columns.length === 0 ? `This view has no to-do or in-progress columns.` : `Nothing open in this view.`}
          style={{ margin: "auto", padding: "24px 12px" }}
        />
      ) : (
        // no-drag: in edit mode the columns' own scrollbars must work, not start a drag of the widget.
        <div className="no-drag" style={{ flex: 1, minHeight: 0, display: "flex", gap: 8, overflowX: "auto" }}>
          {columns.map((c) => (
            <Column key={c.status.id} column={c} viewId={view.id} onOpen={onOpen} editing={editing} refetch={refetch} />
          ))}
        </div>
      )}
      {open !== null && (
        <TaskPanel
          taskId={open}
          initial={tasks.find((t) => t.id === open)}
          onClose={() => {
            setOpen(null);
            // An edit may have moved the task on, or out of the view.
            if (changed.current) {
              changed.current = false;
              refetch();
            }
          }}
          onChanged={() => (changed.current = true)}
          onDeleted={() => (changed.current = true)}
        />
      )}
    </>
  );
}

function Column({
  column,
  viewId,
  onOpen,
  editing,
  refetch,
}: {
  column: OpenColumn;
  viewId: number;
  onOpen?: (id: number) => void;
  editing: boolean;
  refetch: () => void;
}) {
  const T = useTerms();
  const { status, count, shown } = column;
  const color = status.color && /^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : palette.muted;
  const pillBg = blend(color, palette.bg, 0.2);
  const more = count - shown.length;
  // Looks like a column of the real board (board/Column.tsx), only smaller.
  return (
    <div
      role="group"
      aria-label={`${status.name}, ${T.countTasks(count)}`}
      style={{
        flex: "1 1 0",
        minWidth: 170,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        background: columnBg(1),
        border: `1px solid ${columnBorder(1)}`,
        borderTop: `3px solid ${columnBorder(1)}`,
        borderRadius: 10,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 12px", minHeight: 32, boxSizing: "border-box" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flex: "none" }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: palette.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={status.name}>
          {status.name}
        </span>
        <span aria-hidden="true" style={{ minWidth: 20, height: 18, padding: "0 6px", boxSizing: "border-box", borderRadius: 9, fontSize: 11, fontWeight: 600, lineHeight: "18px", textAlign: "center", background: pillBg, color: readable(color, pillBg) }}>
          {count}
        </span>
      </div>
      <div className="no-drag" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((t) => (
          <WidgetCard key={t.id} task={t} onOpen={onOpen} editing={editing} refetch={refetch} />
        ))}
        {more > 0 &&
          (editing ? (
            <span aria-disabled="true" style={{ fontSize: 12, textAlign: "center", padding: "2px 0", color: palette.subtle }}>
              +{more} more
            </span>
          ) : (
            <a href={`#/view/${viewId}`} aria-label={`${more} more in ${status.name}, open the view`} style={{ fontSize: 12, textAlign: "center", padding: "2px 0" }}>
              +{more} more
            </a>
          ))}
        {count === 0 && <span style={{ color: palette.subtle, fontSize: 12, textAlign: "center", padding: "12px 0" }}>No {T.tasks} here yet</span>}
      </div>
    </div>
  );
}

/** One card: the board's own card with its own quick actions (the hover
 *  buttons and the right-click menu chosen in Settings > Card actions), so a
 *  task is handled here as it is on the board. A change reloads the widget
 *  (the server decides where the task belongs now). While the dashboard
 *  layout is edited there are no actions and nothing opens, since the widget
 *  is for dragging then. Cards do not drag between columns here. */
function WidgetCard({ task, onOpen, editing, refetch }: { task: Task; onOpen?: (id: number) => void; editing: boolean; refetch: () => void }) {
  const actions = useCardActions(task, { onOpen: (id) => onOpen?.(id), onChanged: () => refetch(), onDeleted: () => refetch() });
  const card = (
    <div
      className="jb-sortable"
      // Enter or Space opens the card, as a button would; the card's own click does the mouse.
      {...(onOpen
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                onOpen(task.id);
              }
            },
          }
        : {})}
    >
      <TaskCard
        task={task}
        config={CARD}
        onOpen={onOpen ? () => onOpen(task.id) : undefined}
        pinned={!editing && actions.pinned}
        rail={editing ? undefined : <CardActionRail task={task} actions={actions} onChanged={() => refetch()} />}
      />
    </div>
  );
  return editing ? card : <CardContextMenu actions={actions}>{card}</CardContextMenu>;
}
