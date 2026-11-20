import { useEffect, useRef, useState } from "react";
import { deleteTaskAsking } from "./deleteTask";
import { Alert, DatePicker, Descriptions, Divider, Drawer, Input, InputNumber, Select, Space, Spin, Typography } from "antd";
import { message } from "../theme/feedback";
import dayjs from "dayjs";
import { api, ApiError, patchWithRetry } from "../api";
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
import { CREATE_EPIC, epicToCreate } from "./epicCreate";
import { priorityOptions } from "./LevelIcons";
import { TagSelect } from "../tags/TagSelect";
import { useTags } from "../tags/tags";
import { TimeBar } from "./TimeBar";
import { SnoozeButton } from "./SnoozeButton";
import { fieldLabel } from "./completeness";
import { useTerms } from "../terms";
import { RoundTag } from "./RoundTag";
import { NextButton, WhatsNext } from "./WhatsNext";
import { Chain } from "./Chain";
import { Rounds } from "./Rounds";
import type { NextMode } from "./nextTask";

// The task panel: the only place the task key is shown. Every edit is a
// PATCH carrying the updated_at last seen; status changes go through /move.

interface Props {
  taskId: number;
  /** The row already on screen, shown at once (and kept if offline). */
  initial?: Task;
  onClose: () => void;
  onChanged: (t: Task) => void;
  onDeleted: (id: number) => void;
  /** Open with the "What's next?" box showing this form. A new object each
   *  time, so asking again for the same form opens it again. */
  openNext?: { mode: NextMode };
}

export function TaskPanel({ taskId, initial, onClose, onChanged, onDeleted, openNext }: Props) {
  const { boot, online, reloadKey } = useApp();
  const { namesOf, refreshIfNew } = useTags();
  const T = useTerms();
  const { epics, refresh: refreshEpics } = useEpics();
  const [task, setTask] = useState<Task | null>(initial ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");

  // The task as last loaded, to tell unsaved typing from what was saved.
  const shown = useRef(task);
  shown.current = task;

  // notify: the task changed underneath (a session was logged), so the
  // board's copy needs the new derived values too.
  // keep: a reload (a live update from another device) keeps a title or
  // description still being typed here; only untouched text is replaced.
  // Only the newest answer is shown: a reload answered after a save made
  // here must not bring the old task back (apply() bumps it too).
  const seq = useRef(0);
  const load = (notify = false, keep = false) => {
    const n = ++seq.current;
    return api
      .get<Task>(`/tasks/${taskId}`)
      .then((t) => {
        if (n !== seq.current) return;
        const prev = keep && shown.current?.id === t.id ? shown.current : null;
        setTask(t);
        setTitle((cur) => (prev && cur !== prev.title ? cur : t.title));
        setDesc((cur) => (prev && cur !== (prev.description ?? "") ? cur : t.description ?? ""));
        if (notify) onChanged(t);
      })
      .catch((e) => {
        // Deleted elsewhere (another tab, the phone): close, once.
        if (e instanceof ApiError && e.status === 404 && n === seq.current) {
          seq.current++;
          message.info("This task was deleted elsewhere.");
          onDeleted(taskId);
          onClose();
          return;
        }
        // Offline: keep whatever is already shown.
        if (online) message.error((e as Error).message);
      });
  };

  useEffect(() => {
    load(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, reloadKey]);

  // The fields come up first; sessions, cycle time and dates follow a frame
  // later, so the panel appears without waiting for all of it.
  const [rest, setRest] = useState(false);
  // An epic's task or a subtask (or a subtask's parent) opened on top of
  // this panel.
  const [child, setChild] = useState<number | null>(null);
  const [childVersion, setChildVersion] = useState(0);
  const [childNext, setChildNext] = useState<{ mode: NextMode }>();
  const openChild = (id: number, mode?: NextMode) => {
    setChild(id);
    setChildNext(mode ? { mode } : undefined);
  };
  const childChanged = useRef(false);
  // The "What's next?" box (SPEC 4.17): opened by moving the task into a
  // done status here, or asked for by the caller or the Next button.
  // n counts the requests, so each one opens a fresh box (even after "Made …").
  const [next, setNextState] = useState<{ mode: NextMode; n: number } | null>(openNext ? { mode: openNext.mode, n: 0 } : null);
  const setNext = (mode: NextMode | null) => setNextState((cur) => (mode ? { mode, n: (cur?.n ?? 0) + 1 } : null));
  useEffect(() => setNext(openNext?.mode ?? null), [taskId, openNext]);
  useEffect(() => {
    const t = window.setTimeout(() => setRest(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const apply = (t: Task) => {
    seq.current++;
    setTask(t);
    setTitle(t.title);
    setDesc(t.description ?? "");
    onChanged(t);
  };

  /** Saves a change; true when it was saved. */
  const patch = async (changes: Record<string, unknown>): Promise<boolean> => {
    if (!task) return false;
    try {
      apply(await patchWithRetry<Task>(`/tasks/${task.id}`, task.updated_at, changes));
      return true;
    } catch (e) {
      message.error((e as Error).message);
      load(true);
      return false;
    }
  };

  // The epic picker: typing a title no epic has offers to create it.
  const [epicSearch, setEpicSearch] = useState("");
  const epicNew = epicToCreate(epicSearch, epics);
  // Creating an epic is two calls (create it, then link it here). busy stops a
  // second click making a second epic; the ref is for a click before the
  // screen has redrawn.
  const [creatingEpic, setCreatingEpic] = useState(false);
  const creatingRef = useRef(false);
  const createEpic = async () => {
    if (!task || !epicNew || creatingRef.current) return;
    creatingRef.current = true;
    setCreatingEpic(true);
    setEpicSearch("");
    let created: Task | null = null;
    try {
      created = await api.post<Task>("/tasks", { title: epicNew, type: "epic", area_id: task.area_id, today: today() });
      refreshEpics();
      if (!(await patch({ epic_id: created.id }))) message.error(`${T.Epic} created, but it could not be added to this ${T.task}.`);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      creatingRef.current = false;
      setCreatingEpic(false);
    }
  };

  const move = async (status_id: number) => {
    if (!task) return;
    const wasDone = task.behaviour === "done";
    try {
      const moved = await api.post<Task>(`/tasks/${task.id}/move`, { status_id, today: today() });
      apply(moved);
      // Into a done status (never cancelled): ask what comes next.
      if (moved.behaviour === "done" && !wasDone) setNext("continue");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = () => {
    if (!task) return;
    deleteTaskAsking(task, (id) => { onDeleted(id); onClose(); }, (e) => message.error(e.message), T);
  };

  const ro = !online;
  const opt = <T extends { id: number; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));

  return (
    <Drawer
      rootClassName="jb-task-panel"
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
            <NextButton task={task} disabled={ro} onPick={setNext} />
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
        <Space direction="vertical" style={{ width: "100%" }} size={18}>
          <Input
            variant="borderless"
            style={{ fontSize: 20, fontWeight: 600, padding: 0 }}
            value={title}
            disabled={ro}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
            // A round's number right after the title (where the browser can
            // size the field to its text; elsewhere at the field's end).
            {...(task.round_no !== null && {
              suffix: <RoundTag no={task.round_no} kind={task.round_kind} />,
              styles: { input: { fontSize: 20, fontWeight: 600, padding: 0, fieldSizing: "content", minWidth: 40 } as React.CSSProperties },
            })}
          />
          {/* What's next? sits under the title, apart from the details. */}
          {next && (
            <WhatsNext
              key={`${task.id}:${next.n}`}
              task={task}
              mode={next.mode}
              onClose={() => setNext(null)}
              onMade={(_, epic) => {
                load(true);
                // A new epic: one made for both, or the next one of an epic.
                if (epic === "new" || task.type === "epic") refreshEpics();
              }}
              onOpenTask={openChild}
            />
          )}
          <Descriptions title="Details" column={1} size="small" colon={false} labelStyle={{ color: palette.muted, width: 90 }}>
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
            <Descriptions.Item label={T.Epic}>
              {task.type === "epic" ? (
                <span style={{ color: palette.muted }}>
                  {task.epic_tasks ? `${task.epic_done}/${task.epic_tasks} done · ${formatHours(task.epic_logged_h)} logged` : `No ${T.tasks} yet`}
                </span>
              ) : task.parent_id ? (
                <span style={{ color: palette.muted }}>The parent's</span>
              ) : (
                <Select
                  size="small"
                  style={{ width: 150 }}
                  allowClear
                  showSearch
                  placeholder={`No ${T.epic}`}
                  disabled={ro}
                  loading={creatingEpic}
                  value={task.epic_id ?? undefined}
                  popupMatchSelectWidth={260}
                  searchValue={epicSearch}
                  onSearch={setEpicSearch}
                  onOpenChange={(open) => !open && setEpicSearch("")}
                  // The Create option always stays in the list; epics match the typed text.
                  filterOption={(input, o) => o?.value === CREATE_EPIC || String(o?.search ?? "").includes(input.trim().toLowerCase())}
                  onChange={(v) => (v === CREATE_EPIC ? createEpic() : patch({ epic_id: v ?? null }))}
                  options={[
                    ...epics.map((e) => ({
                      value: e.id,
                      search: e.title.toLowerCase(),
                      label: (
                        <span>
                          <TypeIcon type="epic" /> {e.title}
                        </span>
                      ),
                    })),
                    ...(epicNew ? [{ value: CREATE_EPIC, search: "", label: <span>Create {T.epic} “{epicNew}”</span> }] : []),
                  ]}
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
                // Starts over only when the estimate itself changed, so a live
                // update to another field keeps a number still being typed.
                key={`${task.id}:${task.estimate_h}`}
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
            <Descriptions.Item label="Tags" span={2}>
              <TagSelect
                size="small"
                disabled={ro}
                value={namesOf(task.tag_ids)}
                onChange={async (names) => {
                  // A new name is only in the tag list once the save has gone through.
                  if (await patch({ tags: names })) refreshIfNew(names);
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Level" span={2}>
              <DifficultySlider value={task.difficulty} disabled={ro} width={340} onChange={(v) => patch({ difficulty: v })} />
            </Descriptions.Item>
          </Descriptions>
          <TimeBar task={task} size="panel" />
          {task.missing.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ padding: "4px 10px" }}
              message={`Details missing: ${task.missing.map((k) => fieldLabel(k, T)).join(", ")}`}
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

          {rest && task.type === "epic" && <EpicTasks epic={task} version={childVersion} onOpenTask={openChild} />}
          {rest && task.type === "task" && !task.parent_id && (
            <Subtasks parent={task} version={childVersion} onOpenTask={openChild} onChanged={() => load(true)} />
          )}
          {rest && <Dependencies task={task} onOpenTask={setChild} onChanged={() => load(true)} />}
          {rest && <Chain task={task} onOpenTask={openChild} />}
          {rest && <Rounds task={task} onOpenTask={openChild} onChanged={() => load(true)} />}
          {rest && (
            <>
              <TaskExtras task={task} patch={patch} onTaskChanged={() => load(true)} />
              <Divider plain orientation="left" style={{ margin: "4px 0" }}>
                Dates
              </Divider>
              <Descriptions column={1} size="small" colon={false} labelStyle={{ color: palette.muted, width: 110 }}>
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
          openNext={childNext}
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
