import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input } from "antd";
import { DownOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { api } from "../api";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { loggedOfEstimate } from "./plan";
import { groupAvailable } from "./availableGroups";
import { drag } from "./drag";
import type { DayData } from "./types";
import type { Task } from "../types";

const COLLAPSED_KEY = "reskon.day.availableCollapsed";
// Sizes of a compact row, used only to give each open group a sensible smallest height.
const ROW_H = 28;
const ROW_GAP = 3;
const HEAD_H = 22 + 6; // header button and the space under it
const BOX_PAD = 14; // group padding and border
const MIN_ROWS = 2;

/** Smallest height of an open group: its header and up to two rows, or all its rows if fewer. */
function groupMin(count: number) {
  const n = Math.min(count, MIN_ROWS);
  const body = n === 0 ? 16 : n * ROW_H + (n - 1) * ROW_GAP;
  return BOX_PAD + HEAD_H + body;
}

function loadCollapsed(): Set<number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(s: Set<number>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s]));
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

/**
 * Open tasks grouped by status, from the ordinary task list. Add one to the
 * day with its button or by dragging it to the plan. Dragging a planned task
 * onto a status here sends it back to that status and takes it off the day.
 */
export function AvailablePanel({
  day,
  data,
  onAdd,
  onMoveBack,
  tasksVersion,
}: {
  day: string;
  data: DayData;
  onAdd: (taskId: number) => void;
  onMoveBack: (itemId: number, taskId: number, statusId: number) => void;
  tasksVersion: number;
}) {
  const { boot, online, behaviourOf, reloadKey } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);

  const update = useCallback((next: Set<number>) => {
    setCollapsed(next);
    saveCollapsed(next);
  }, []);

  // Read on opening, on another day, after a change to the tasks themselves (a move, a new task) and on
  // a live reload. Plan changes alone need no read: the lines already on the day are left out here.
  useEffect(() => {
    let live = true;
    api
      .get<Task[]>("/tasks")
      .then((t) => live && setTasks(t))
      .catch((e: Error) => live && message.error(e.message));
    return () => {
      live = false;
    };
  }, [day, tasksVersion, reloadKey]);

  const planned = useMemo(() => new Set(data.items.flatMap((i) => (i.task_id ? [i.task_id] : []))), [data.items]);
  const groups = groupAvailable(tasks, boot.statuses, behaviourOf, planned, query);

  const open = groups.map((g) => !collapsed.has(g.status.id));

  return (
    <aside
      aria-label="Available tasks"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: palette.panel,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 0,
      }}
    >
      <Input.Search allowClear placeholder="Find a task" aria-label="Find a task" value={query} onChange={(e) => setQuery(e.target.value)} size="small" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {groups.map(({ status, tasks: list }, gi) => (
          <div
            key={status.id}
            role="group"
            aria-labelledby={`avail-h-${status.id}`}
            onDragOver={(e) => {
              if (drag.current?.type === "item" && drag.current.taskId) {
                e.preventDefault();
                setOver(status.id);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const d = drag.current;
              drag.end();
              if (d?.type === "item" && d.taskId) onMoveBack(d.id, d.taskId, status.id);
            }}
            style={{
              flex: open[gi] ? "0 1 auto" : "0 0 auto",
              minHeight: open[gi] ? groupMin(list.length) : 0,
              display: "flex",
              flexDirection: "column",
              padding: 6,
              boxSizing: "border-box",
              borderRadius: 6,
              border: `1px dashed ${over === status.id ? palette.accent : "transparent"}`,
            }}
          >
            <h3 id={`avail-h-${status.id}`} style={{ fontSize: 12, margin: 0 }}>
              <button
                type="button"
                aria-expanded={open[gi]}
                onClick={() => {
                  const next = new Set(collapsed);
                  if (open[gi]) next.add(status.id);
                  else next.delete(status.id);
                  update(next);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  height: 22,
                  flex: "none",
                  margin: open[gi] ? "0 0 6px" : 0,
                  padding: 0,
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12,
                  textAlign: "left",
                  color: palette.subtle,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {open[gi] ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                <span>
                  {status.name} <span style={{ fontWeight: 400 }}>({list.length})</span>
                </span>
              </button>
            </h3>
            {open[gi] && (
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: ROW_GAP,
                  flex: "0 1 auto",
                  minHeight: 0,
                  overflowY: "auto",
                }}
              >
                {list.map((t) => (
                  <li
                    key={t.id}
                    draggable={online}
                    onDragStart={(e) => {
                      drag.start({ type: "task", id: t.id });
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", t.title);
                    }}
                    onDragEnd={() => drag.end()}
                    style={{
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "3px 6px",
                      fontSize: 12,
                      lineHeight: "20px",
                      flex: "none",
                      border: `1px solid ${palette.border}`,
                      borderRadius: 6,
                      background: palette.panelDim,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={t.title}
                    >
                      {t.title}
                    </span>
                    <span
                      style={{
                        color: palette.muted,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {loggedOfEstimate(t)}
                    </span>
                    <Button type="text" size="small" icon={<PlusOutlined />} style={{ width: 22, height: 22, minWidth: 22, padding: 0, fontSize: 12 }} disabled={!online} aria-label={`Add ${t.title} to the plan`} onClick={() => onAdd(t.id)} />
                  </li>
                ))}
                {list.length === 0 && (
                  <li
                    style={{
                      listStyle: "none",
                      color: palette.subtle,
                      fontSize: 12,
                    }}
                  >
                    None
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
