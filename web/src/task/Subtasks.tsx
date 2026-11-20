import { useEffect, useState } from "react";
import { Button, Checkbox, Divider, Input, Select, Spin, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { formatHours, today } from "../format";
import { palette } from "../theme/palette";
import type { Task, TaskBrief } from "../types";
import { TaskTitle } from "./RoundTag";
import { pressable } from "../a11y";
import { useTerms } from "../terms";

// A task's subtasks, as a checklist under its fields. Each is a full task
// (its own status, key and sessions); ticking one moves it to the first
// done status, unticking back to the first to-do status. Counts on the
// parent are the server's (subtask_done / subtask_count).

interface Props {
  parent: Task;
  /** Bumped when a subtask changed in its own panel, to load the list again. */
  version: number;
  onOpenTask: (id: number) => void;
  /** A subtask was added or ticked: the parent's counts changed. */
  onChanged: () => void;
}

export function Subtasks({ parent, version, onOpenTask, onChanged }: Props) {
  const { boot, online, behaviourOf } = useApp();
  const T = useTerms();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Task[]>(`/tasks?parent=${parent.id}`)
      .then((ts) => setTasks(ts.sort((a, b) => a.id - b.id)))
      .catch((e) => online && message.error((e as Error).message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.id, version]);

  // The first status of a behaviour, on-board ones before the rest.
  const firstOf = (behaviour: string) =>
    [...boot.statuses]
      .filter((s) => behaviourOf(s.id) === behaviour)
      .sort((a, b) => Number(b.on_board) - Number(a.on_board) || a.position - b.position)[0];

  const tick = async (t: Task, done: boolean) => {
    const to = firstOf(done ? "done" : "todo");
    if (!to) return;
    try {
      const moved = await api.post<Task>(`/tasks/${t.id}/move`, { status_id: to.id, today: today() });
      setTasks((ts) => ts?.map((x) => (x.id === t.id ? moved : x)) ?? null);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const t = await api.post<Task>("/tasks", { title: title.trim(), parent_id: parent.id, today: today() });
      setTasks((ts) => [...(ts ?? []), t]);
      setTitle("");
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Subtasks{parent.subtask_count > 0 ? ` · ${parent.subtask_done} of ${parent.subtask_count} done` : ""}
      </Divider>
      {!tasks ? (
        <Spin size="small" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {tasks.map((t) => {
            const status = boot.statuses.find((s) => s.id === t.status_id);
            const finished = t.behaviour === "done" || t.behaviour === "cancelled";
            return (
              <div key={t.id} className="jb-clickable" style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px", borderRadius: 4 }}>
                <Checkbox
                  checked={t.behaviour === "done"}
                  disabled={!online || t.behaviour === "cancelled"}
                  onChange={(e) => tick(t, e.target.checked)}
                  aria-label={`Mark ${t.title} done`}
                />
                <span
                  {...pressable(() => onOpenTask(t.id))}
                  style={{
                    cursor: "pointer",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: finished ? palette.muted : palette.fg,
                    textDecoration: finished ? "line-through" : undefined,
                  }}
                >
                  <TaskTitle task={t} />
                </span>
                {t.logged_h > 0 && <span style={{ color: palette.muted, fontSize: 12 }}>⏱ {formatHours(t.logged_h)}</span>}
                <span style={{ color: palette.muted, fontSize: 12 }}>{status?.name}</span>
              </div>
            );
          })}
          <Input
            size="small"
            variant="borderless"
            placeholder="+ Add a subtask"
            value={title}
            disabled={!online || busy}
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={add}
            onKeyDown={(e) => e.key === "Escape" && setTitle("")}
            style={{ paddingInline: 4 }}
          />
          {tasks.length === 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, paddingInline: 4 }}>
              Break it into small steps. Each one is its own {T.task}, hidden from boards unless the view's filter shows subtasks.
            </Typography.Text>
          )}
        </div>
      )}
    </>
  );
}

/** The panel's Parent field: a picker of ordinary tasks for a task without
 *  subtasks, or a link to the parent for a subtask. */
export function ParentField({ task, disabled, onPick, onOpen }: { task: Task; disabled: boolean; onPick: (id: number | null) => void; onOpen: (id: number) => void }) {
  const [briefs, setBriefs] = useState<TaskBrief[] | null>(null);
  const load = () => !briefs && api.get<TaskBrief[]>("/tasks?brief=1").then(setBriefs).catch(() => undefined);
  useEffect(() => {
    if (task.parent_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.parent_id]);

  if (task.subtask_count > 0) return <span style={{ color: palette.muted }}>Has subtasks</span>;
  const parent = briefs?.find((b) => b.id === task.parent_id);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", minWidth: 0 }}>
      <Select
        size="small"
        style={{ width: 150 }}
        allowClear
        showSearch
        optionFilterProp="search"
        placeholder="None"
        disabled={disabled}
        loading={!briefs && !!task.parent_id}
        onDropdownVisibleChange={(open) => open && load()}
        value={task.parent_id ?? undefined}
        onChange={(v) => onPick(v ?? null)}
        options={(briefs ?? [])
          .filter((b) => b.type === "task" && !b.parent_id && b.id !== task.id && (b.behaviour === "todo" || b.behaviour === "in_progress" || b.id === task.parent_id))
          .map((b) => ({ value: b.id, search: b.title.toLowerCase(), label: b.title }))}
      />
      {parent && (
        <Button type="link" size="small" onClick={() => onOpen(parent.id)} style={{ fontSize: 12 }}>
          Open
        </Button>
      )}
    </span>
  );
}
