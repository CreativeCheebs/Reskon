import { useMemo } from "react";
import { Button, Typography } from "antd";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { filterOf } from "../views/cardConfig";
import { groupTasks } from "../views/grouping";
import { useSaveView } from "../views/useViewState";
import { useEpics } from "../task/useEpics";
import { TypeIcon } from "../task/TypeIcon";
import type { Task, View } from "../types";
import { Lane } from "./Lane";

// Columns are on_board statuses only. Hidden statuses (Backlog, Cancelled,
// anything with on_board = 0) are reached by header buttons. Grouping turns
// the board into swimlanes; collapsed columns and grouping are saved on the
// view as soon as they change.

interface Props {
  view: View;
  tasks: Task[];
  setTasks: (fn: (prev: Task[]) => Task[]) => void;
  refetch: () => void;
  onOpenTask: (id: number) => void;
  onOpenHidden: (statusId: number) => void;
}

export function Board({ view, tasks, setTasks, refetch, onOpenTask, onOpenHidden }: Props) {
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
  const hiddenStatuses = boot.statuses.filter((s) => !s.on_board).sort((a, b) => a.position - b.position);
  const groups = useMemo(() => groupTasks(tasks, groupBy, boot, epics), [tasks, groupBy, boot, epics]);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {hiddenStatuses.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "0 0 10px", justifyContent: "flex-end" }}>
          {hiddenStatuses.map((s) => (
            <Button key={s.id} size="small" onClick={() => onOpenHidden(s.id)}>
              {s.name} <span style={{ color: palette.muted }}>{tasks.filter((t) => t.status_id === s.id).length}</span>
            </Button>
          ))}
        </div>
      )}
      {groupBy === "none" ? (
        <div style={{ flex: 1, minHeight: 0, overflowX: "auto", display: "flex" }}>{lane(groups[0], false)}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
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
    </div>
  );
}
