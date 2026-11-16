import { useMemo, useRef, useState } from "react";
import { Empty } from "antd";
import { useApp } from "../store";
import { blend, palette, readable } from "../theme/palette";
import { columnBg, columnBorder } from "../board/columnStyle";
import { TaskCard } from "../board/TaskCard";
import { TaskPanel } from "../task/TaskPanel";
import { DEFAULT_SHOW } from "../views/cardConfig";
import { useTerms } from "../terms";
import type { CardConfig, Task, View } from "../types";
import { openColumns, type OpenColumn } from "./boardColumns";

// A board widget's body: the view's open tasks as small, read-only columns.
// Cards open the task panel; nothing here drags or changes a status (that
// stays on the board). The task key is never shown, as on the board.

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
            <Column key={c.status.id} column={c} viewId={view.id} onOpen={onOpen} editing={editing} />
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

function Column({ column, viewId, onOpen, editing }: { column: OpenColumn; viewId: number; onOpen?: (id: number) => void; editing: boolean }) {
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
          <div
            key={t.id}
            className="jb-sortable"
            // Enter or Space opens the card, as a button would; the card's own click does the mouse.
            {...(onOpen
              ? {
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                      e.preventDefault();
                      onOpen(t.id);
                    }
                  },
                }
              : {})}
          >
            <TaskCard task={t} config={CARD} onOpen={onOpen ? () => onOpen(t.id) : undefined} />
          </div>
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
