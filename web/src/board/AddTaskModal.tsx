import { useEffect, useRef, useState, type ReactNode } from "react";
import { DatePicker, Form, Input, Modal, Segmented, Select, Typography, type InputRef } from "antd";
import dayjs from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { filterOf } from "../views/cardConfig";
import { today } from "../format";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import { useEpics } from "../task/useEpics";
import { DifficultySlider } from "../task/DifficultySlider";
import { priorityOptions } from "../task/LevelIcons";
import { SnoozeField } from "../task/SnoozeField";
import { durationError, parseDuration } from "../sessions/DurationInput";
import { TagSelect } from "../tags/TagSelect";
import { useTags } from "../tags/tags";
import type { Task, View } from "../types";

/**
 * The "+ Add" pop-up of a board column: the same fields as the phone's New task screen, with the
 * Title focused so a name and Enter is all it takes. Mount it only while open (it takes its
 * starting values once). Priority, energy type, status, epic and snooze that are not chosen are
 * left out of the request, so the server's own defaults apply.
 */
export function AddTaskModal({
  statusId,
  view,
  defaults = {},
  onCreated,
  onClose,
}: {
  /** The column's status, chosen to begin with. */
  statusId: number;
  view: View;
  /** From the swimlane the column sits in, e.g. {epic_id} or {priority_id}. */
  defaults?: Record<string, unknown>;
  onCreated: (t: Task) => void;
  onClose: () => void;
}) {
  const { boot, online, behaviourOf } = useApp();
  const T = useTerms();
  const { epics, refresh: refreshEpics } = useEpics();
  const { refreshIfNew } = useTags();
  const num = (k: string) => (typeof defaults[k] === "number" ? (defaults[k] as number) : null);
  // A view's areas are a sensible default, unless the view leaves them out ("Area is not ...").
  const viewFilter = filterOf(view);
  const viewAreas = viewFilter.not?.includes("areas") ? undefined : viewFilter.areas;

  const [title, setTitle] = useState("");
  const [isEpic, setIsEpic] = useState(defaults.type === "epic");
  const [status, setStatus] = useState<number | null>(boot.statuses.some((s) => s.id === statusId) ? statusId : null);
  const [area, setArea] = useState<number | undefined>(num("area_id") ?? viewAreas?.[0] ?? boot.areas[0]?.id);
  const [epicId, setEpicId] = useState<number | null>(num("epic_id"));
  const [energy, setEnergy] = useState<number | null>(num("energy_type_id"));
  const [priority, setPriority] = useState<number | null>(num("priority_id"));
  const [level, setLevel] = useState<number | null>(num("difficulty"));
  const [tags, setTags] = useState<string[]>([]);
  const [estimate, setEstimate] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [snooze, setSnooze] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const titleRef = useRef<InputRef>(null);
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const behaviour = status === null ? "todo" : behaviourOf(status);
  const canSnooze = behaviour === "todo" || behaviour === "in_progress";
  const estimateProblem = durationError(estimate);
  const ready = title.trim() !== "" && area !== undefined && !estimateProblem && online;

  const create = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        area_id: area,
        type: isEpic ? "epic" : "task",
        difficulty: level,
        estimate_h: parseDuration(estimate) ?? null,
        due_at: due,
        today: today(),
      };
      // Left out (not null) when not chosen, so the server's own default applies.
      if (canSnooze && snooze) body.snooze_until = snooze;
      if (tags.length) body.tags = tags;
      if (status !== null) body.status_id = status;
      if (energy !== null) body.energy_type_id = energy;
      if (priority !== null) body.priority_id = priority;
      if (!isEpic && epicId !== null) body.epic_id = epicId;
      const t = await api.post<Task>("/tasks", body);
      if (isEpic) refreshEpics();
      refreshIfNew(tags);
      message.success(`${isEpic ? T.Epic : T.Task} created`);
      onCreated(t);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      inFlight.current = false;
      setBusy(false);
    }
  };

  const field = (label: string, node: ReactNode, id?: string) => (
    <Form.Item label={label} htmlFor={id} style={{ marginBottom: 10 }}>
      {node}
    </Form.Item>
  );
  const statuses = boot.statuses.filter((s) => s.on_board || s.id === statusId);
  const dueBeforeSnooze = canSnooze && !!snooze && !!due && due < snooze;

  return (
    <Modal
      open
      title={`New ${T.task}`}
      okText={`Add ${T.task}`}
      width={460}
      centered
      afterOpenChange={(o) => o && titleRef.current?.focus()}
      onOk={create}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !ready, title: online ? undefined : OFFLINE_TIP }}
    >
      {/* Enter creates from the two one-line boxes only, so it never fights a drop-down or date pop-up. */}
      <Form layout="vertical" size="small" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
        {field(
          "Title",
          <Input
            id="add-task-title"
            ref={titleRef}
            autoFocus
            size="middle"
            value={title}
            maxLength={300}
            disabled={!online}
            placeholder="What needs doing?"
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={create}
          />,
          "add-task-title",
        )}
        <Form.Item style={{ marginBottom: 10 }}>
          <Segmented
            size="small"
            aria-label="Type"
            value={isEpic ? "epic" : "task"}
            onChange={(v) => setIsEpic(v === "epic")}
            options={[
              { value: "task", label: T.Task },
              { value: "epic", label: T.Epic },
            ]}
          />
        </Form.Item>
        {field(
          "Status",
          <Select
            id="add-task-status"
            allowClear
            placeholder="First to do"
            value={status ?? undefined}
            onChange={(v) => setStatus(v ?? null)}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          />,
          "add-task-status",
        )}
        {field(
          "Area",
          <Select id="add-task-area" value={area} onChange={setArea} options={boot.areas.map((a) => ({ value: a.id, label: a.name }))} />,
          "add-task-area",
        )}
        {!isEpic &&
          epics.length > 0 &&
          field(
            T.Epic,
            <Select
              id="add-task-epic"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={`No ${T.epic}`}
              value={epicId ?? undefined}
              onChange={(v) => setEpicId(v ?? null)}
              options={epics.map((e) => ({ value: e.id, label: e.title }))}
            />,
            "add-task-epic",
          )}
        {field(
          "Energy type",
          <Select
            id="add-task-energy"
            allowClear
            placeholder="Area's default"
            value={energy ?? undefined}
            onChange={(v) => setEnergy(v ?? null)}
            options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
          />,
          "add-task-energy",
        )}
        {field(
          "Priority",
          <Select
            id="add-task-priority"
            allowClear
            placeholder="Default"
            value={priority ?? undefined}
            onChange={(v) => setPriority(v ?? null)}
            options={priorityOptions(boot.priorities)}
          />,
          "add-task-priority",
        )}
        {field("Level", <DifficultySlider value={level} onChange={setLevel} width={230} />)}
        {field("Tags", <TagSelect size="small" value={tags} onChange={setTags} />)}
        <div style={{ display: "flex", gap: 10 }}>
          <Form.Item
            label="Estimate"
            htmlFor="add-task-estimate"
            style={{ flex: 1, marginBottom: 10 }}
            validateStatus={estimateProblem ? "error" : undefined}
            help={estimateProblem ?? undefined}
          >
            <Input id="add-task-estimate" value={estimate} placeholder="e.g. 2h" onChange={(e) => setEstimate(e.target.value)} onPressEnter={create} />
          </Form.Item>
          <Form.Item label="Due" htmlFor="add-task-due" style={{ flex: 1, marginBottom: 10 }}>
            <DatePicker
              id="add-task-due"
              style={{ width: "100%" }}
              value={due ? dayjs(due) : null}
              onChange={(d) => setDue(d ? d.format("YYYY-MM-DD") : null)}
            />
          </Form.Item>
        </div>
        {canSnooze && field("Snooze until", <SnoozeField value={snooze} onChange={setSnooze} />)}
        {dueBeforeSnooze && <Typography.Text style={{ color: palette.warn, fontSize: 12 }}>Due before it shows again</Typography.Text>}
        {error && (
          <Typography.Text type="danger" role="alert" style={{ display: "block", marginTop: 6 }}>
            {error}
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
}
