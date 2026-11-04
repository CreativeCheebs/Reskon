import { useEffect, useRef, useState } from "react";
import { deleteTaskAsking } from "./deleteTask";
import { Alert, DatePicker, Descriptions, Divider, Drawer, Input, InputNumber, Select, Space, Spin, Typography } from "antd";
import { message } from "../theme/feedback";
import dayjs from "dayjs";
import { api, patchWithRetry } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatAge, formatDateTime, formatHours, today } from "../format";
import { palette } from "../theme/palette";
import type { Task } from "../types";
import { DifficultySlider } from "./DifficultySlider";
import { EpicTasks } from "./EpicTasks";
import { ParentField, Subtasks } from "./Subtasks";
import { Dependencies } from "./Dependencies";
import { TaskExtras } from "./TaskExtras";
import { TypeIcon, TypeLabel } from "./TypeIcon";
import { useEpics } from "./useEpics";
import { priorityOptions } from "./LevelIcons";
import { TimeBar } from "./TimeBar";
import { SnoozeButton } from "./SnoozeButton";
import { fieldLabel } from "./completeness";

// The task panel: the only place the task key is shown. Every edit is a
// PATCH carrying the updated_at last seen; status changes go through /move.

interface Props {
  taskId: number;
  /** The row already on screen, shown at once (and kept if offline). */
  initial?: Task;
  onClose: () => void;
  onChanged: (t: Task) => void;
  onDeleted: (id: number) => void;
}

export function TaskPanel({ taskId, initial, onClose, onChanged, onDeleted }: Props) {
  const { boot, online, reloadKey } = useApp();
  const { epics, refresh: refreshEpics } = useEpics();
  const [task, setTask] = useState<Task | null>(initial ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");

  // notify: the task changed underneath (a session was logged), so the
  // board's copy needs the new derived values too.
  const load = (notify = false) =>
    api
      .get<Task>(`/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setTitle(t.title);
        setDesc(t.description ?? "");
        if (notify) onChanged(t);
      })
      // Offline: keep whatever is already shown.
      .catch((e) => online && message.error((e as Error).message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, reloadKey]);

  // The fields come up first; sessions, cycle time and dates follow a frame
  // later, so the panel appears without waiting for all of it.
  const [rest, setRest] = useState(false);
  // An epic's task or a subtask (or a subtask's parent) opened on top of
  // this panel.
  const [child, setChild] = useState<number | null>(null);
  const [childVersion, setChildVersion] = useState(0);
  const childChanged = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRest(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const apply = (t: Task) => {
    setTask(t);
    setTitle(t.title);
    setDesc(t.description ?? "");
    onChanged(t);
  };

  const patch = async (changes: Record<string, unknown>) => {
    if (!task) return;
    try {
      apply(await patchWithRetry<Task>(`/tasks/${task.id}`, task.updated_at, changes));
    } catch (e) {
      message.error((e as Error).message);
      load(true);
    }
  };

  const move = async (status_id: number) => {
    if (!task) return;
    try {
      apply(await api.post<Task>(`/tasks/${task.id}/move`, { status_id, today: today() }));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = () => {
    if (!task) return;
    deleteTaskAsking(task, (id) => { onDeleted(id); onClose(); }, (e) => message.error(e.message));
  };

  const ro = !online;
  const opt = <T extends { id: number; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));

  return (
    <Drawer
      open
      width={task?.type === "epic" ? 860 : 520}
      onClose={onClose}
      title={
        task ? (
          <span style={{ color: palette.muted, fontWeight: 500, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <TypeIcon type={task.type} /> {task.key}
          </span>
        ) : null
      }
      extra={
        task && (
          <Space size={8}>
            <SnoozeButton task={task} onChanged={apply} />
            <WriteButton danger size="small" onClick={remove}>
              Delete
            </WriteButton>
          </Space>
        )
      }
    >
      {!task ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Input
            variant="borderless"
            style={{ fontSize: 17, fontWeight: 600, padding: 0 }}
            value={title}
            disabled={ro}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
          />
          <Descriptions column={2} size="small" colon={false} labelStyle={{ color: palette.muted, width: 90 }}>
            <Descriptions.Item label="Type">
              <Select
                size="small"
                style={{ width: 150 }}
                disabled={ro}
                value={task.type}
                onChange={async (v) => {
                  await patch({ type: v });
                  refreshEpics();
                }}
                // A subtask is always an ordinary task.
                options={(task.parent_id ? (["task"] as const) : (["task", "epic"] as const)).map((t) => ({ value: t, label: <TypeLabel type={t} /> }))}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Epic">
              {task.type === "epic" ? (
                <span style={{ color: palette.muted }}>
                  {task.epic_tasks ? `${task.epic_done}/${task.epic_tasks} done · ${formatHours(task.epic_logged_h)} logged` : "No tasks yet"}
                </span>
              ) : task.parent_id ? (
                <span style={{ color: palette.muted }}>The parent's</span>
              ) : (
                <Select
                  size="small"
                  style={{ width: 150 }}
                  allowClear
                  showSearch
                  optionFilterProp="search"
                  placeholder="No epic"
                  disabled={ro}
                  value={task.epic_id ?? undefined}
                  onChange={(v) => patch({ epic_id: v ?? null })}
                  options={epics.map((e) => ({
                    value: e.id,
                    search: e.title.toLowerCase(),
                    label: (
                      <span>
                        <TypeIcon type="epic" /> {e.title}
                      </span>
                    ),
                  }))}
                />
              )}
            </Descriptions.Item>
            {task.type === "task" && (
              <Descriptions.Item label="Parent" span={2}>
                <ParentField task={task} disabled={ro} onPick={(id) => patch({ parent_id: id })} onOpen={setChild} />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Status">
              <Select size="small" style={{ width: 150 }} disabled={ro} value={task.status_id} onChange={move} options={opt(boot.statuses)} />
            </Descriptions.Item>
            <Descriptions.Item label="Area">
              <Select size="small" style={{ width: 150 }} disabled={ro} value={task.area_id} onChange={(v) => patch({ area_id: v })} options={opt(boot.areas)} />
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              <Select
                size="small"
                style={{ width: 150 }}
                allowClear
                disabled={ro}
                value={task.priority_id ?? undefined}
                onChange={(v) => patch({ priority_id: v ?? null })}
                options={priorityOptions(boot.priorities)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Energy type">
              <Select
                size="small"
                style={{ width: 150 }}
                allowClear
                disabled={ro}
                value={task.energy_type_id ?? undefined}
                onChange={(v) => patch({ energy_type_id: v ?? null })}
                options={opt(boot.energy_types)}
              />
            </Descriptions.Item>

            <Descriptions.Item label="Estimate (h)">
              <InputNumber
                size="small"
                style={{ width: 150 }}
                min={0}
                step={0.5}
                disabled={ro}
                defaultValue={task.estimate_h ?? undefined}
                key={task.updated_at}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== task.estimate_h) patch({ estimate_h: v });
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Due">
              <DatePicker
                size="small"
                style={{ width: 150 }}
                disabled={ro}
                value={task.due_at ? dayjs(task.due_at) : null}
                onChange={(d) => patch({ due_at: d ? d.format("YYYY-MM-DD") : null })}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Start date">
              <DatePicker
                size="small"
                style={{ width: 150 }}
                disabled={ro}
                value={task.start_date ? dayjs(task.start_date) : null}
                onChange={(d) => patch({ start_date: d ? d.format("YYYY-MM-DD") : null })}
              />
            </Descriptions.Item>
            <Descriptions.Item label="End date">
              <DatePicker
                size="small"
                style={{ width: 150 }}
                disabled={ro}
                value={task.end_date ? dayjs(task.end_date) : null}
                onChange={(d) => patch({ end_date: d ? d.format("YYYY-MM-DD") : null })}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Intensity" span={2}>
              <DifficultySlider value={task.difficulty} disabled={ro} width={340} onChange={(v) => patch({ difficulty: v })} />
            </Descriptions.Item>
          </Descriptions>
          <TimeBar task={task} size="panel" />
          {task.missing.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ padding: "4px 10px" }}
              message={`Details missing: ${task.missing.map(fieldLabel).join(", ")}`}
            />
          )}
          <Input.TextArea
            placeholder="Description"
            autoSize={{ minRows: 3, maxRows: 12 }}
            disabled={ro}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (task.description ?? "") && patch({ description: desc })}
          />

          {rest && task.type === "epic" && <EpicTasks epic={task} version={childVersion} onOpenTask={setChild} />}
          {rest && task.type === "task" && !task.parent_id && (
            <Subtasks parent={task} version={childVersion} onOpenTask={setChild} onChanged={() => load(true)} />
          )}
          {rest && <Dependencies task={task} onOpenTask={setChild} onChanged={() => load(true)} />}
          {rest && (
            <>
              <TaskExtras task={task} patch={patch} onTaskChanged={() => load(true)} />
              <Divider plain orientation="left" style={{ margin: "4px 0" }}>
                Dates
              </Divider>
              <Descriptions column={2} size="small" colon={false} labelStyle={{ color: palette.muted, width: 110 }}>
                <Descriptions.Item label="Created">{formatDateTime(task.created_at)}</Descriptions.Item>
                <Descriptions.Item label="Created age">{formatAge(task.created_age_h)}</Descriptions.Item>
                <Descriptions.Item label="First started">{formatDateTime(task.first_started_at)}</Descriptions.Item>
                <Descriptions.Item label="Started age">{formatAge(task.started_age_h)}</Descriptions.Item>
                <Descriptions.Item label="Last started">{formatDateTime(task.last_started_at)}</Descriptions.Item>
                <Descriptions.Item label="Time in status">
                  <span style={{ color: task.stalled ? palette.danger : undefined }}>{formatAge(task.time_in_status_h)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Completed">{formatDateTime(task.completed_at)}</Descriptions.Item>
                <Descriptions.Item label="Cancelled">{formatDateTime(task.cancelled_at)}</Descriptions.Item>
                <Descriptions.Item label="Points">{task.points ?? "–"}</Descriptions.Item>
                <Descriptions.Item label="Logged">{formatHours(task.logged_h)}</Descriptions.Item>
                {task.subtask_count > 0 && (
                  <Descriptions.Item label="With subtasks">{formatHours(task.logged_total_h)}</Descriptions.Item>
                )}
              </Descriptions>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Updated {formatDateTime(task.updated_at)}
              </Typography.Text>
            </>
          )}
        </Space>
      )}
      {child !== null && (
        <TaskPanel
          taskId={child}
          onClose={() => {
            setChild(null);
            // A task's time or status feeds the epic's totals.
            if (childChanged.current) {
              childChanged.current = false;
              setChildVersion((v) => v + 1);
              load(true);
            }
          }}
          onChanged={() => (childChanged.current = true)}
          onDeleted={() => (childChanged.current = true)}
        />
      )}
    </Drawer>
  );
}
