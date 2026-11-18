import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../api";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { formatHM } from "../format";
import { groupAvailable } from "./availableGroups";
import { BringForward } from "./BringForward";
import { drag } from "./drag";
import type { Run } from "./usePlanner";
import type { DayData } from "./types";
import type { Task } from "../types";

/**
 * Open tasks grouped by status, from the ordinary task list. Add one to the
 * day with its button or by dragging it to the plan. Dragging a planned task
 * onto a status here sends it back to that status and takes it off the day.
 */
export function AvailablePanel({ day, data, run, onMoveBack, tasksVersion }: { day: string; data: DayData; run: Run; onMoveBack: (itemId: number, taskId: number, statusId: number) => void; tasksVersion: number }) {
  const { boot, online, behaviourOf, reloadKey } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<number | null>(null);

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

  return (
    <aside aria-labelledby="avail-heading" style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 16px 16px", minWidth: 0 }}>
      <h2 id="avail-heading" style={{ fontSize: 16, margin: 0 }}>
        Available tasks
      </h2>
      <p style={{ color: palette.muted, fontSize: 12, margin: "4px 0 8px" }}>
        Drag a task to the plan or use its add button. Drag a planned task onto a status, or use its actions menu, to take it off this day.
      </p>
      <Input.Search allowClear placeholder="Find a task" aria-label="Find a task" value={query} onChange={(e) => setQuery(e.target.value)} size="small" />
      {groups.map(({ status, tasks: list }) => (
        <section
          key={status.id}
          aria-label={status.name}
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
          style={{ marginTop: 12, padding: 6, borderRadius: 6, border: `1px dashed ${over === status.id ? palette.accent : "transparent"}` }}
        >
          <h3 style={{ fontSize: 12, margin: "0 0 6px", color: palette.subtle, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {status.name} <span style={{ fontWeight: 400 }}>({list.length})</span>
          </h3>
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
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
                style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", border: `1px solid ${palette.border}`, borderRadius: 6, background: palette.panelDim }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.title}>
                  {t.title}
                </span>
                <span style={{ color: palette.muted, fontSize: 11, whiteSpace: "nowrap" }}>{t.estimate_h === null ? "no estimate" : formatHM(t.estimate_h)}</span>
                <Button size="small" icon={<PlusOutlined />} disabled={!online} aria-label={`Add ${t.title} to the plan`} onClick={() => run(() => api.post(`/day/${data.day}/items`, { task_id: t.id }))} />
              </li>
            ))}
            {list.length === 0 && <li style={{ listStyle: "none", color: palette.subtle, fontSize: 12 }}>None</li>}
          </ul>
        </section>
      ))}
      <BringForward day={data.day} run={run} />
    </aside>
  );
}
