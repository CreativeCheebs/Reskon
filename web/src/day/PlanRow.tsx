import { Button, Checkbox, Dropdown, Tooltip, type MenuProps } from "antd";
import { CalendarOutlined, CheckSquareOutlined, ClockCircleOutlined, HolderOutlined, MoreOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { dayFigure, loggedOfEstimate } from "./plan";
import { drag } from "./drag";
import type { DayItem } from "./types";

export interface RowActions {
  onLog: (item: DayItem) => void;
  onReschedule: (item: DayItem) => void;
  /** Edit the line's planned time and name. */
  onEdit: (item: DayItem) => void;
  /** Events only: mark done or not done. */
  onToggleDone?: (item: DayItem) => void;
  /** Show the linked task. */
  onOpenTask?: (taskId: number) => void;
  onRemove: (item: DayItem) => void;
  onStep: (item: DayItem, step: -1 | 1) => void;
  /** Put the dragged line before this one (null: at the end). */
  onDropBefore: (beforeId: number | null) => void;
  onStartTimer?: (item: DayItem) => void;
  /** Return a task to a status: the same move as dragging it to a status in Available tasks. */
  onMoveToStatus?: (item: DayItem, statusId: number) => void;
  /** The statuses a planned task can go back to, in board order. */
  statusChoices?: { id: number; name: string }[];
  /** A timer is already counting on this line. */
  timing?: boolean;
}

/** One line of the plan: a task or an event. Drag it to reorder, or use the actions menu (also by keyboard). */
export function PlanRow({ item, first, last, actions }: { item: DayItem; first: boolean; last: boolean; actions: RowActions }) {
  const { boot, online } = useApp();
  const area = boot.areas.find((a) => a.id === item.area_id);
  const isTask = item.kind === "task";
  const taskDone = isTask && item.task_done;

  const menu: MenuProps["items"] = [
    { key: "log", label: "Log a session" },
    ...(actions.onStartTimer ? [{ key: "timer", label: actions.timing ? "Timer running" : "Start timer", disabled: actions.timing }] : []),
    { key: "edit", label: "Edit plan…" },
    ...(actions.onToggleDone ? [{ key: "done", label: item.done ? "Mark not done" : "Mark done", disabled: taskDone }] : []),
    { key: "reschedule", label: "Reschedule…" },
    { key: "up", label: "Move up", disabled: first },
    { key: "down", label: "Move down", disabled: last },
    ...(isTask && actions.onMoveToStatus && actions.statusChoices?.length
      ? [
          {
            key: "status",
            label: "Remove from plan, back to status",
            children: actions.statusChoices.map((s) => ({ key: `status:${s.id}`, label: s.name })),
          },
        ]
      : []),
    { type: "divider" as const },
    { key: "remove", label: "Remove from plan", danger: true },
  ];
  const onMenu: MenuProps["onClick"] = ({ key }) => {
    if (key === "log") actions.onLog(item);
    else if (key === "timer") actions.onStartTimer?.(item);
    else if (key === "edit") actions.onEdit(item);
    else if (key === "done") actions.onToggleDone?.(item);
    else if (key === "reschedule") actions.onReschedule(item);
    else if (key === "up") actions.onStep(item, -1);
    else if (key === "down") actions.onStep(item, 1);
    else if (key === "remove") actions.onRemove(item);
    else if (key.startsWith("status:")) actions.onMoveToStatus?.(item, Number(key.slice(7)));
  };

  return (
    <Dropdown menu={{ items: menu, onClick: onMenu }} trigger={["contextMenu"]} disabled={!online}>
    <li
      draggable={online}
      onDragStart={(e) => {
        drag.start({ type: "item", id: item.id, taskId: item.task_id });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.title);
      }}
      onDragEnd={() => drag.end()}
      onDragOver={(e) => {
        if (drag.current?.type === "item") e.preventDefault();
      }}
      onDrop={(e) => {
        if (drag.current?.type !== "item") return;
        e.preventDefault();
        e.stopPropagation();
        actions.onDropBefore(item.id);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        background: palette.panelDim,
        listStyle: "none",
        opacity: item.done ? 0.75 : 1,
      }}
    >
      <HolderOutlined aria-hidden style={{ color: palette.subtle, cursor: online ? "grab" : "default" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tooltip title={taskDone ? "Task done" : item.done ? "Done for the day" : "Tick when it is done for the day"}>
            <Checkbox
              checked={item.done}
              disabled={!online || taskDone}
              onChange={() => actions.onToggleDone?.(item)}
              aria-label={taskDone ? `Task done: ${item.title}` : `${item.done ? "Mark not done" : "Mark done"}: ${item.title}`}
            />
          </Tooltip>
          {isTask ? (
            <CheckSquareOutlined aria-label="Task" style={{ color: palette.accent }} />
          ) : (
            <CalendarOutlined aria-label="Event" style={{ color: palette.warn }} />
          )}
          {isTask && item.task_id && actions.onOpenTask ? (
            <Button
              type="link"
              onClick={() => actions.onOpenTask?.(item.task_id as number)}
              aria-label={`Open task ${item.task_title ?? item.title}`}
              style={{ padding: 0, height: "auto", fontWeight: 600, color: palette.fg, textDecoration: item.done ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textAlign: "left" }}
            >
              {item.title}
            </Button>
          ) : (
            <span style={{ fontWeight: 600, textDecoration: item.done ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
          )}
        </div>
        <div style={{ color: palette.muted, fontSize: 12 }}>
          {isTask && item.renamed && item.task_title && `Part of: ${item.task_title} · `}
          {area?.name ?? "No area"}
          {item.session_count > 0 && !isTask && ` · ${item.session_count} session${item.session_count === 1 ? "" : "s"}`}
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontWeight: 600 }} title="Logged on this day / planned for this day">
          {dayFigure(item)}
        </div>
        {isTask && (
          <div style={{ color: palette.subtle, fontSize: 11 }} title="All time logged / task estimate">
            {loggedOfEstimate(item)}
          </div>
        )}
      </div>
      {actions.onStartTimer && (
        <Button
          size="small"
          icon={actions.timing ? <ClockCircleOutlined /> : <PlayCircleOutlined />}
          disabled={!online || actions.timing}
          onClick={() => actions.onStartTimer?.(item)}
          aria-label={`${actions.timing ? "Timer running on" : "Start timer on"} ${item.title}`}
        />
      )}
      <Button size="small" disabled={!online} onClick={() => actions.onLog(item)} aria-label={`Log a session for ${item.title}`}>
        Log
      </Button>
      <Dropdown menu={{ items: menu, onClick: onMenu }} trigger={["click"]} disabled={!online}>
        <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`Actions for ${item.title}`} aria-haspopup="menu" />
      </Dropdown>
    </li>
    </Dropdown>
  );
}
