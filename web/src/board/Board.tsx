import { memo, useMemo, type CSSProperties } from "react";
import { Typography } from "antd";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { filterOf } from "../views/cardConfig";
import { groupTasks } from "../views/grouping";
import { useSaveView } from "../views/useViewState";
import { useEpics } from "../task/useEpics";
import { TypeIcon } from "../task/TypeIcon";
import type { Task, View } from "../types";
import { Lane } from "./Lane";
import { COL_GAP, useBoardFit } from "./useBoardFit";
import { useSurfaceOpacity, withAlpha } from "../views/ViewBackdrop";

// Columns are on_board statuses only. Hidden statuses (Backlog, Cancelled,
// anything with on_board = 0) are reached from the view toolbar. Grouping turns
// the board into swimlanes; collapsed columns and grouping are saved on the
// view as soon as they change.

interface Props {
  view: View;
  tasks: Task[];
  setTasks: (fn: (prev: Task[]) => Task[]) => void;
  refetch: () => void;
  onOpenTask: (id: number) => void;
}

export const Board = memo(function Board({ view, tasks, setTasks, refetch, onOpenTask }: Props) {
  const { boot } = useApp();
  const { byId: epics } = useEpics();
  const save = useSaveView(view);
  const filter = filterOf(view);
  const groupBy = view.board_state?.group_by === "status" ? "none" : view.board_state?.group_by ?? "none";
  const collapsed = useMemo(() => new Set(view.board_state?.collapsed ?? []), [view.board_state?.collapsed]);

  const boardStatuses = useMemo(
    () =>
      boot.statuses
        .filter((s) => s.on_board && (!filter.statuses || filter.statuses.includes(s.id)))
        .sort((a, b) => a.position - b.position),
    [boot.statuses, filter.statuses],
  );
  const groups = useMemo(() => groupTasks(tasks, groupBy, boot, epics), [tasks, groupBy, boot, epics]);

  const collapsedCount = boardStatuses.filter((s) => collapsed.has(s.id)).length;
  const fit = useBoardFit(boardStatuses.length - collapsedCount, collapsedCount);

  const toggleCollapse = (statusId: number) => {
    const next = new Set(collapsed);
    if (next.has(statusId)) next.delete(statusId);
    else next.add(statusId);
    save({ board_state: { collapsed: [...next] } });
  };

  const lane = (g: (typeof groups)[number], inLane: boolean) => (
    <Lane
      view={view}
      tasks={g.tasks}
      boardStatuses={boardStatuses}
      collapsed={collapsed}
      onToggleCollapse={toggleCollapse}
      inLane={inLane}
      createDefaults={g.defaults}
      setTasks={setTasks}
      refetch={refetch}
      onOpenTask={onOpenTask}
    />
  );

  // Columns read their width from --col-w. The bottom padding keeps the
  // horizontal scrollbar clear of the columns' "Add task" rows.
  const scroller: CSSProperties = {
    height: "100%",
    paddingBottom: 6,
    boxSizing: "border-box",
    ["--col-w" as string]: `${fit.width}px`,
  };

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {groupBy === "none" ? (
        <div ref={fit.ref} style={{ ...scroller, overflowX: "auto", overflowY: "hidden", display: "flex" }}>
          {lane(groups[0], false)}
        </div>
      ) : (
        <div ref={fit.ref} style={{ ...scroller, overflow: "auto" }}>
          {groups.map((g) => {
            const onBoard = g.tasks.filter((t) => boardStatuses.some((s) => s.id === t.status_id)).length;
            return (
              <section key={g.key} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 6px", position: "sticky", left: 0 }}>
                  {g.epic && <TypeIcon type="epic" />}
                  <Typography.Text
                    strong
                    style={{ cursor: g.epic ? "pointer" : undefined }}
                    onClick={() => g.epic && onOpenTask(g.epic.id)}
                  >
                    {g.label}
                  </Typography.Text>
                  <span style={{ color: palette.muted, fontSize: 12 }}>{onBoard}</span>
                  {g.epic?.epic_tasks ? (
                    <span style={{ color: palette.muted, fontSize: 12 }}>
                      · {g.epic.epic_done}/{g.epic.epic_tasks} done
                    </span>
                  ) : null}
                </div>
                {lane(g, true)}
              </section>
            );
          })}
          {groups.length === 0 && <Typography.Text type="secondary">Nothing matches.</Typography.Text>}
        </div>
      )}
      {fit.more.left && <EdgeFade side="left" />}
      {fit.more.right && <EdgeFade side="right" />}
    </div>
  );
});

/** A soft shade over the board's edge while more columns lie past it. */
function EdgeFade({ side }: { side: "left" | "right" }) {
  const surface = useSurfaceOpacity();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 16,
        [side]: 0,
        width: COL_GAP * 3,
        pointerEvents: "none",
        background: `linear-gradient(to ${side}, transparent, ${withAlpha(palette.bg, surface)})`,
      }}
    />
  );
}
