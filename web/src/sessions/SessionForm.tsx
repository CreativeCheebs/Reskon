import { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Form, Input, InputNumber, Radio, Select, TimePicker, Typography } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useApp } from "../store";
import { formatHours, today } from "../format";
import { palette } from "../theme/palette";
import type { Session, TaskBrief } from "../types";
import { DifficultySlider } from "../task/DifficultySlider";
import { RankedSubtypes } from "./RankedSubtypes";
import { CustomFieldsEditor } from "../fields/CustomFieldsEditor";

// The fields of a session, shared by the manual log form and quick capture.
// Energy type follows the spec's chain only for what is preselected:
// task's energy type, else the area default, else blank. Difficulty
// defaults to the task's when a task is picked and no difficulty was set
// by hand. The user can always change either.
//
// A session can have up to four energy types. Each takes a share of the
// hours (whole percents adding up to 100, so no hour counts twice) and has
// its own intensity. The first is kept in energy_type_id / difficulty /
// share, the rest in more; the server works out each part's points.

/** An energy type of a session after the first. share is a percent. */
export interface EnergyPart {
  energy_type_id: number | null;
  share: number;
  difficulty: number | null;
}

const MAX_ENERGIES = 4;

export interface SessionDraft {
  task_id: number | null;
  label: string;
  area_id: number | null;
  kind: "task" | "event";
  energy_type_id: number | null;
  hours: number | null;
  /** Only when editing: the stored points, shown read-only. The server
   *  recalculates them when hours, intensity, energy types or task change.
   *  Undefined on a new session. */
  points?: number | null;
  difficulty: number | null;
  /** The first energy type's share in percent; 100 when it is the only one. */
  share: number;
  more: EnergyPart[];
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
    share: 100,
    more: [],
    subtypes: [],
    logged_for: today(),
    started_at: null,
    note: "",
    custom: {},
    ...partial,
  };
}

/** Every energy type of a draft, the first included. */
export function draftParts(d: SessionDraft): EnergyPart[] {
  return [{ energy_type_id: d.energy_type_id, share: d.more.length ? d.share : 100, difficulty: d.difficulty }, ...d.more];
}

function withParts(d: SessionDraft, parts: EnergyPart[]): SessionDraft {
  const [first, ...more] = parts;
  return { ...d, energy_type_id: first.energy_type_id, share: more.length ? first.share : 100, difficulty: first.difficulty, more };
}

/** The draft fields for an existing session, energy types included. */
export function draftFromSession(s: Session): Partial<SessionDraft> {
  const [first, ...more] = s.energies?.length ? s.energies : [{ energy_type_id: s.energy_type_id, share: 1, difficulty: s.difficulty }];
  return {
    energy_type_id: first.energy_type_id,
    difficulty: first.difficulty,
    share: Math.round(first.share * 100),
    more: more.map((e) => ({ energy_type_id: e.energy_type_id, share: Math.round(e.share * 100), difficulty: e.difficulty })),
  };
}

/** Whether an edit changes what a session's points depend on: hours,
 *  task, energy types, shares or intensities. */
export function pointsInputsChanged(d: SessionDraft, s: Session): boolean {
  const before = draftFromSession(s);
  const was = draftParts({ ...d, ...before, more: before.more ?? [] });
  const now = draftParts(d);
  return (
    d.hours !== s.hours ||
    d.task_id !== s.task_id ||
    was.length !== now.length ||
    was.some((p, i) => p.energy_type_id !== now[i].energy_type_id || p.share !== now[i].share || p.difficulty !== now[i].difficulty)
  );
}

/** Whether a draft can be saved: hours, and every energy type chosen once
 *  with shares adding up to 100%. */
export function sessionReady(d: SessionDraft): boolean {
  const parts = draftParts(d);
  return (
    !!d.hours &&
    parts.every((p) => p.energy_type_id && p.share >= 1) &&
    new Set(parts.map((p) => p.energy_type_id)).size === parts.length &&
    parts.reduce((n, p) => n + p.share, 0) === 100
  );
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
    ...(d.more.length
      ? { energies: draftParts(d).map((p) => ({ energy_type_id: p.energy_type_id, share: p.share / 100, difficulty: p.difficulty })) }
      : {}),
    subtypes: d.subtypes,
    logged_for: d.logged_for,
    started_at: d.started_at,
    note: d.note || null,
    custom: d.custom,
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

  // Difficulty: a new session takes its task's difficulty unless one was
  // set by hand. Opening an existing session leaves it as saved until its
  // task is changed.
  const [touchedDifficulty, setTouchedDifficulty] = useState(draft.difficulty !== null);
  const openedWithTask = useRef(draft.points !== undefined ? draft.task_id : undefined);
  useEffect(() => {
    if (touchedDifficulty || openedWithTask.current === draft.task_id) return;
    openedWithTask.current = undefined;
    const want = tasks.find((t) => t.id === draft.task_id)?.difficulty ?? null;
    if (want !== draft.difficulty) set({ difficulty: want });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.task_id, tasks]);

  const startedAt: Dayjs | null = draft.started_at ? dayjs(draft.started_at) : null;

  return (
    <Form layout="vertical" size="small" disabled={disabled}>
      <Form.Item label="Kind" style={{ marginBottom: 8 }}>
        <Radio.Group value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
          <Radio.Button value="task">Work</Radio.Button>
          <Radio.Button value="event">Event (not work)</Radio.Button>
        </Radio.Group>
      </Form.Item>
      {!draft.task_id && (
        <Form.Item label="Title" style={{ marginBottom: 8 }}>
          <Input value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder="What it was" />
        </Form.Item>
      )}
      {/* An event is not work on a task, so it only asks for a title; one
          already saved against a task still shows its task. */}
      {(draft.kind === "task" || draft.task_id) && (
        <Form.Item label="Task (optional)" style={{ marginBottom: 8 }}>
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
        <Form.Item label="Hours" required style={{ marginBottom: 8 }}>
          <InputNumber style={{ width: "100%" }} min={0.05} max={24} step={0.25} value={draft.hours} onChange={(v) => set({ hours: v })} />
        </Form.Item>
      </div>
      <EnergyFields
        draft={draft}
        onChange={onChange}
        disabled={disabled}
        onFirstType={() => setTouchedEnergy(true)}
        onFirstIntensity={() => setTouchedDifficulty(true)}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
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
          energyTypeId={draft.more.length ? undefined : draft.energy_type_id ?? undefined}
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

// EnergyFields: the session's energy types, each with its intensity, and
// with two or more, each one's share of the hours.
function EnergyFields({
  draft,
  onChange,
  disabled,
  onFirstType,
  onFirstIntensity,
}: {
  draft: SessionDraft;
  onChange: (d: SessionDraft) => void;
  disabled?: boolean;
  onFirstType: () => void;
  onFirstIntensity: () => void;
}) {
  const { boot } = useApp();
  const parts = draftParts(draft);
  const several = parts.length > 1;
  const total = parts.reduce((n, p) => n + p.share, 0);
  const setParts = (ps: EnergyPart[], patch: Partial<SessionDraft> = {}) => onChange({ ...withParts(draft, ps), ...patch });
  const setPart = (i: number, patch: Partial<EnergyPart>) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Moving one share moves another the other way, so they keep adding up
  // to 100: the last one, or the one before it when the last is moved.
  const setShare = (i: number, v: number) => {
    const ps = parts.map((p) => ({ ...p }));
    const other = i === ps.length - 1 ? i - 1 : ps.length - 1;
    const want = Math.min(99, Math.max(1, Math.round(v)));
    const delta = want - ps[i].share;
    ps[i].share = want;
    ps[other].share = Math.max(1, ps[other].share - delta);
    setParts(ps);
  };
  // A new type takes half of the biggest share.
  const addPart = () => {
    const ps = parts.map((p) => ({ ...p }));
    const big = ps.reduce((b, p, j) => (p.share > ps[b].share ? j : b), 0);
    const give = Math.max(1, Math.floor(ps[big].share / 2));
    if (ps[big].share - give < 1) return;
    ps[big].share -= give;
    ps.push({ energy_type_id: null, share: give, difficulty: null });
    setParts(ps);
  };
  // A removed type's share goes to the one above it.
  const removePart = (i: number) => {
    const ps = parts.filter((_, j) => j !== i).map((p) => ({ ...p }));
    ps[Math.max(0, i - 1)].share += parts[i].share;
    if (ps.length === 1) ps[0].share = 100;
    setParts(ps);
  };

  const taken = new Set(parts.map((p) => p.energy_type_id));
  return (
    <Form.Item
      label={several ? "Energy types · share of the hours · intensity" : "Energy type · intensity"}
      required
      style={{ marginBottom: 8 }}
      help={
        several && total !== 100 ? (
          <span style={{ color: palette.warn }}>Shares add up to {total}%; they need to add up to 100%.</span>
        ) : undefined
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {parts.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Select
              style={{ width: several ? 140 : 180 }}
              placeholder="Energy type"
              value={p.energy_type_id ?? undefined}
              onChange={(v) => {
                if (i === 0) onFirstType();
                if (!several) setParts([{ ...p, energy_type_id: v }], { subtypes: [] });
                else setPart(i, { energy_type_id: v });
              }}
              options={boot.energy_types.map((e) => ({ value: e.id, label: e.name, disabled: e.id !== p.energy_type_id && taken.has(e.id) }))}
            />
            {several && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <InputNumber
                  size="small"
                  style={{ width: 70 }}
                  min={1}
                  max={99}
                  value={p.share}
                  formatter={(v) => `${v}%`}
                  parser={(v) => Number((v ?? "").replace("%", "")) || 1}
                  onChange={(v) => v !== null && setShare(i, v)}
                  aria-label="Share of the hours"
                />
                <span style={{ fontSize: 11, color: palette.muted, minWidth: 36 }}>
                  {draft.hours ? formatHours((draft.hours * p.share) / 100) : ""}
                </span>
              </span>
            )}
            <DifficultySlider
              value={p.difficulty}
              disabled={disabled}
              width={several ? 190 : 230}
              onChange={(v) => {
                if (i === 0) onFirstIntensity();
                setPart(i, { difficulty: v });
              }}
            />
            {several && !disabled && (
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => removePart(i)} aria-label="Remove this energy type" />
            )}
          </div>
        ))}
        {!disabled && parts.length < MAX_ENERGIES && (
          <Typography.Link onClick={addPart} style={{ fontSize: 12 }}>
            <PlusOutlined /> Add energy type
          </Typography.Link>
        )}
      </div>
    </Form.Item>
  );
}
