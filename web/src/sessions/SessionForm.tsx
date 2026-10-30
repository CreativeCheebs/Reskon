import { useEffect, useMemo, useState } from "react";
import { DatePicker, Form, Input, InputNumber, Radio, Select, TimePicker } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useApp } from "../store";
import { today } from "../format";
import type { TaskBrief } from "../types";
import { DifficultySlider } from "../task/DifficultySlider";
import { RankedSubtypes } from "./RankedSubtypes";
import { CustomFieldsEditor } from "../fields/CustomFieldsEditor";

// The fields of a session, shared by the manual log form and quick capture.
// Energy type follows the spec's chain only for what is preselected:
// task's energy type, else the area default, else blank. The user can
// always change it.

export interface SessionDraft {
  task_id: number | null;
  label: string;
  area_id: number | null;
  kind: "task" | "event";
  energy_type_id: number | null;
  hours: number | null;
  /** Only when editing: points were stored when the session was logged and
   *  change only by hand. Undefined on a new session (the server sets them). */
  points?: number | null;
  difficulty: number | null;
  subtypes: number[];
  logged_for: string;
  started_at: string | null;
  note: string;
  custom: Record<string, unknown>;
}

export function emptySession(partial: Partial<SessionDraft> = {}): SessionDraft {
  return {
    task_id: null,
    label: "",
    area_id: null,
    kind: "task",
    energy_type_id: null,
    hours: null,
    difficulty: null,
    subtypes: [],
    logged_for: today(),
    started_at: null,
    note: "",
    custom: {},
    ...partial,
  };
}

/** The body for POST /api/sessions. */
export function sessionBody(d: SessionDraft) {
  return {
    task_id: d.task_id,
    label: d.task_id ? null : d.label || null,
    area_id: d.area_id,
    kind: d.kind,
    energy_type_id: d.energy_type_id,
    hours: d.hours,
    difficulty: d.difficulty,
    subtypes: d.subtypes,
    logged_for: d.logged_for,
    started_at: d.started_at,
    note: d.note || null,
    custom: d.custom,
    ...(d.points !== undefined ? { points: d.points } : {}),
  };
}

export function SessionFields({
  draft,
  onChange,
  tasks,
  disabled,
}: {
  draft: SessionDraft;
  onChange: (d: SessionDraft) => void;
  tasks: TaskBrief[];
  disabled?: boolean;
}) {
  const { boot } = useApp();
  const set = (patch: Partial<SessionDraft>) => onChange({ ...draft, ...patch });
  const openTasks = useMemo(
    () => tasks.filter((t) => (t.behaviour !== "done" && t.behaviour !== "cancelled") || t.id === draft.task_id),
    [tasks, draft.task_id],
  );

  // Preselect energy type when the task or area changes and none is chosen.
  const [touchedEnergy, setTouchedEnergy] = useState(draft.energy_type_id !== null);
  useEffect(() => {
    if (touchedEnergy) return;
    const task = tasks.find((t) => t.id === draft.task_id);
    const area = boot.areas.find((a) => a.id === (task?.area_id ?? draft.area_id));
    const energy = task?.energy_type_id ?? area?.default_energy_type_id ?? null;
    if (energy !== draft.energy_type_id) set({ energy_type_id: energy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.task_id, draft.area_id, tasks]);

  const startedAt: Dayjs | null = draft.started_at ? dayjs(draft.started_at) : null;

  return (
    <Form layout="vertical" size="small" disabled={disabled}>
      <Form.Item label="Kind" style={{ marginBottom: 8 }}>
        <Radio.Group value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
          <Radio.Button value="task">Work</Radio.Button>
          <Radio.Button value="event">Event (not work)</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="Task" style={{ marginBottom: 8 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="No task"
          value={draft.task_id ?? undefined}
          onChange={(v) => {
            const t = tasks.find((x) => x.id === v);
            set({ task_id: v ?? null, area_id: t?.area_id ?? draft.area_id });
          }}
          options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Form.Item>
      {!draft.task_id && (
        <Form.Item label="Label" style={{ marginBottom: 8 }}>
          <Input value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder="What it was" />
        </Form.Item>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Form.Item label="Area" style={{ marginBottom: 8 }}>
          <Select
            allowClear
            value={draft.area_id ?? undefined}
            onChange={(v) => set({ area_id: v ?? null })}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Form.Item>
        <Form.Item label="Energy type" required style={{ marginBottom: 8 }}>
          <Select
            value={draft.energy_type_id ?? undefined}
            onChange={(v) => {
              setTouchedEnergy(true);
              set({ energy_type_id: v, subtypes: [] });
            }}
            options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
          />
        </Form.Item>
        <Form.Item label="Hours" required style={{ marginBottom: 8 }}>
          <InputNumber style={{ width: "100%" }} min={0.05} max={24} step={0.25} value={draft.hours} onChange={(v) => set({ hours: v })} />
        </Form.Item>
        <Form.Item label="Difficulty" style={{ marginBottom: 8 }}>
          <DifficultySlider value={draft.difficulty} disabled={disabled} width={230} onChange={(v) => set({ difficulty: v })} />
        </Form.Item>
        {draft.points !== undefined && (
          <Form.Item label="Points" tooltip="Stored when the session was logged. Editing hours or difficulty leaves them as they are." style={{ marginBottom: 8 }}>
            <InputNumber style={{ width: "100%" }} min={0} step={0.5} value={draft.points} onChange={(v) => set({ points: v })} />
          </Form.Item>
        )}
        <Form.Item label="Logged for" required style={{ marginBottom: 8 }}>
          <DatePicker
            style={{ width: "100%" }}
            allowClear={false}
            value={dayjs(draft.logged_for)}
            onChange={(d) => d && set({ logged_for: d.format("YYYY-MM-DD") })}
          />
        </Form.Item>
        <Form.Item label="Started at (optional)" style={{ marginBottom: 8 }}>
          <TimePicker
            style={{ width: "100%" }}
            format="HH:mm"
            value={startedAt}
            onChange={(t) =>
              set({
                started_at: t
                  ? dayjs(draft.logged_for).hour(t.hour()).minute(t.minute()).second(0).toISOString()
                  : null,
              })
            }
          />
        </Form.Item>
      </div>
      <Form.Item label="Subtypes (drag to rank)" style={{ marginBottom: 8 }}>
        <RankedSubtypes
          value={draft.subtypes}
          onChange={(subtypes) => set({ subtypes })}
          energyTypeId={draft.energy_type_id ?? undefined}
          disabled={disabled}
        />
      </Form.Item>
      <Form.Item label="Note" style={{ marginBottom: 8 }}>
        <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
      </Form.Item>
      <CustomFieldsEditor entity="session" value={draft.custom} onChange={(k, v) => set({ custom: { ...draft.custom, [k]: v } })} disabled={disabled} />
    </Form>
  );
}
