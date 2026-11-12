import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker, Form, Input, Segmented, Select, TimePicker, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useApp } from "../store";
import { today } from "../format";
import { palette } from "../theme/palette";
import type { Session, TaskBrief } from "../types";
import { RankedSubtypes } from "./RankedSubtypes";
import { CustomFieldsEditor } from "../fields/CustomFieldsEditor";
import { DurationInput, MAX_HOURS } from "./DurationInput";
import { EnergyFields } from "./EnergyFields";
import { kindOptions } from "./kind";
import { TagSelect } from "../tags/TagSelect";
import { useTags } from "../tags/tags";
import { useTerms } from "../terms";

// The fields of a session, shared by the manual log form and quick capture.
// Laid out as a worklog: duration, date and start time first, then a short
// description and the task; area, energy types, intensity and subtypes sit
// in a quieter Details block, and the longer note opens on demand.
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

export interface SessionDraft {
  task_id: number | null;
  /** The worklog description (session.label). With a task it starts as the
   *  task's title; left that way it is saved empty, so lists show the task. */
  label: string;
  /** The label is still the task title filled in for the person. */
  label_suggested?: boolean;
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
  /** The tags put on this session by hand, by name. Its task's tags are not here: they follow the task. */
  tags: string[];
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
    tags: [],
    ...partial,
  };
}

/** Every energy type of a draft, the first included. */
export function draftParts(d: SessionDraft): EnergyPart[] {
  return [{ energy_type_id: d.energy_type_id, share: d.more.length ? d.share : 100, difficulty: d.difficulty }, ...d.more];
}

export function withParts(d: SessionDraft, parts: EnergyPart[]): SessionDraft {
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
    d.hours <= MAX_HOURS &&
    parts.every((p) => p.energy_type_id && p.share >= 1) &&
    new Set(parts.map((p) => p.energy_type_id)).size === parts.length &&
    parts.reduce((n, p) => n + p.share, 0) === 100
  );
}

/** The body for POST /api/sessions. */
export function sessionBody(d: SessionDraft) {
  return {
    task_id: d.task_id,
    label: d.task_id && d.label_suggested ? null : d.label.trim() || null,
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
    tags: d.tags,
  };
}

export function SessionFields({
  draft,
  onChange,
  tasks,
  disabled,
  autoFocus,
  onKeyDown,
}: {
  draft: SessionDraft;
  onChange: (d: SessionDraft) => void;
  tasks: TaskBrief[];
  disabled?: boolean;
  /** Put the cursor in Duration (the manual log form). */
  autoFocus?: boolean;
  /** Key presses inside the form (the manual form saves on Enter). */
  onKeyDown?: React.KeyboardEventHandler<HTMLFormElement>;
}) {
  const { boot } = useApp();
  const T = useTerms();
  const { namesOf } = useTags();
  // The tags the chosen task has right now; the session shows them and they follow the task.
  const inherited = namesOf(tasks.find((t) => t.id === draft.task_id)?.tag_ids);
  const set = (patch: Partial<SessionDraft>) => onChange({ ...draft, ...patch });
  const openTasks = useMemo(
    () => tasks.filter((t) => (t.behaviour !== "done" && t.behaviour !== "cancelled") || t.id === draft.task_id),
    [tasks, draft.task_id],
  );

  // What a task or area preselects, worked out together and applied as one
  // change: separate updates in the same render would each start from the
  // same old draft and the last would undo the others.
  //  - Energy type: the task's, else the area default, unless chosen by hand.
  //  - Intensity: a new session takes its task's unless set by hand. Opening
  //    an existing session leaves it as saved until its task is changed.
  //  - Description: with a task and nothing typed, the task's title. Typing
  //    takes it over; it is never overwritten after that.
  const [touchedEnergy, setTouchedEnergy] = useState(draft.energy_type_id !== null);
  const [touchedDifficulty, setTouchedDifficulty] = useState(draft.difficulty !== null);
  const openedWithTask = useRef(draft.points !== undefined ? draft.task_id : undefined);
  useEffect(() => {
    const task = tasks.find((t) => t.id === draft.task_id);
    const patch: Partial<SessionDraft> = {};
    if (!touchedEnergy) {
      const area = boot.areas.find((a) => a.id === (task?.area_id ?? draft.area_id));
      const energy = task?.energy_type_id ?? area?.default_energy_type_id ?? null;
      if (energy !== draft.energy_type_id) patch.energy_type_id = energy;
    }
    if (!touchedDifficulty && openedWithTask.current !== draft.task_id) {
      openedWithTask.current = undefined;
      const want = task?.difficulty ?? null;
      if (want !== draft.difficulty) patch.difficulty = want;
    }
    if (task && (!draft.label || draft.label_suggested) && task.title !== draft.label) {
      patch.label = task.title;
      patch.label_suggested = true;
    }
    if (Object.keys(patch).length) set(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.task_id, draft.area_id, tasks]);

  const [durationError, setDurationError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(!!draft.note);
  const startedAt: Dayjs | null = draft.started_at ? dayjs(draft.started_at) : null;
  // Two columns for short fields side by side, one on a narrow screen.
  const pair = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 12px" } as const;
  const tight = { marginBottom: 10 };

  return (
    <Form layout="vertical" size="middle" disabled={disabled} requiredMark onKeyDown={onKeyDown}>
      {/* One switch, two equal options: same height, padding and selected fill. */}
      <Segmented
        size="small"
        className="jb-kind"
        value={draft.kind}
        onChange={(v) => set({ kind: v as SessionDraft["kind"] })}
        options={kindOptions(T)}
        aria-label="Kind"
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0 12px" }}>
        <Form.Item
          label="Duration"
          htmlFor="session-duration"
          required
          style={tight}
          validateStatus={durationError ? "error" : undefined}
          help={durationError ?? undefined}
        >
          <DurationInput
            id="session-duration"
            hours={draft.hours}
            autoFocus={autoFocus}
            disabled={disabled}
            onChange={(hours, err) => {
              setDurationError(err);
              set({ hours });
            }}
          />
        </Form.Item>
        <Form.Item label="Date logged" htmlFor="session-date" required style={tight}>
          <DatePicker
            id="session-date"
            size="large"
            style={{ width: "100%" }}
            allowClear={false}
            value={dayjs(draft.logged_for)}
            onChange={(d) => {
              if (!d) return;
              const day = d.format("YYYY-MM-DD");
              // A start time stays the same time of day on the new date.
              const s = draft.started_at ? dayjs(draft.started_at) : null;
              set({ logged_for: day, started_at: s ? dayjs(day).hour(s.hour()).minute(s.minute()).second(0).toISOString() : null });
            }}
          />
        </Form.Item>
        <Form.Item label="Started at" htmlFor="session-start" style={tight}>
          <TimePicker
            id="session-start"
            size="large"
            style={{ width: "100%" }}
            format="HH:mm"
            placeholder="optional"
            value={startedAt}
            onChange={(t) =>
              set({
                started_at: t ? dayjs(draft.logged_for).hour(t.hour()).minute(t.minute()).second(0).toISOString() : null,
              })
            }
          />
        </Form.Item>
      </div>
      <Form.Item
        label="Description"
        htmlFor="session-description"
        style={tight}
        extra={draft.task_id && draft.label_suggested ? `Filled in from the ${T.task}; type to describe this piece of work.` : "A few words on what you did."}
      >
        <Input
          id="session-description"
          size="middle"
          value={draft.label}
          onChange={(e) => set({ label: e.target.value, label_suggested: false })}
          placeholder={draft.kind === "event" ? "e.g. Dinner with family" : "e.g. Wired up the login form"}
          maxLength={300}
        />
      </Form.Item>
      {/* An event is not work on a task, so it doesn't offer one; one
          already saved against a task still shows its task. */}
      {(draft.kind === "task" || draft.task_id) && (
        <Form.Item label={T.Task} htmlFor="session-task" style={tight}>
          <Select
            id="session-task"
            size="middle"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={`No ${T.task} (optional)`}
            value={draft.task_id ?? undefined}
            onChange={(v) => {
              const t = tasks.find((x) => x.id === v);
              // Swap a filled-in title for the new task's; keep typed words.
              const suggested = !draft.label || draft.label_suggested;
              set({
                task_id: v ?? null,
                area_id: t?.area_id ?? draft.area_id,
                ...(suggested ? { label: t?.title ?? "", label_suggested: !!t } : {}),
              });
            }}
            options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
          />
        </Form.Item>
      )}

      <div
        style={{
          marginTop: 4,
          padding: "10px 12px 2px",
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
          background: palette.panelDim,
        }}
      >
        <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          Details
        </Typography.Text>
        <div style={pair}>
          <Form.Item label="Area" htmlFor="session-area" style={tight}>
            <Select
              id="session-area"
              allowClear
              placeholder="None"
              value={draft.area_id ?? undefined}
              onChange={(v) => set({ area_id: v ?? null })}
              options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
        </div>
        <EnergyFields
          draft={draft}
          onChange={onChange}
          disabled={disabled}
          onFirstType={() => setTouchedEnergy(true)}
          onFirstIntensity={() => setTouchedDifficulty(true)}
        />
        <Form.Item
          label="Tags"
          htmlFor="session-tags"
          style={tight}
          extra={inherited.length ? "Tags with a grey outline come from the task and follow it. Add more for this session." : undefined}
        >
          <TagSelect id="session-tags" value={draft.tags} fixed={inherited} disabled={disabled} onChange={(tags) => set({ tags })} />
        </Form.Item>
        <Form.Item label="Subtypes" tooltip="Drag to rank; rank sets each one's weight" style={tight}>
          <RankedSubtypes
            value={draft.subtypes}
            onChange={(subtypes) => set({ subtypes })}
            energyTypeId={draft.more.length ? undefined : draft.energy_type_id ?? undefined}
            disabled={disabled}
          />
        </Form.Item>
        <CustomFieldsEditor entity="session" value={draft.custom} onChange={(k, v) => set({ custom: { ...draft.custom, [k]: v } })} disabled={disabled} />
      </div>

      {noteOpen ? (
        <Form.Item
          label="Note"
          htmlFor="session-note"
          style={{ marginTop: 12, marginBottom: 4 }}
          extra="Longer thoughts kept with this session: how it went, what to pick up next."
        >
          <Input.TextArea
            id="session-note"
            autoSize={{ minRows: 2, maxRows: 6 }}
            value={draft.note}
            autoFocus={!draft.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Form.Item>
      ) : (
        <Typography.Link
          style={{ display: "inline-block", marginTop: 12, fontSize: 13 }}
          onClick={() => setNoteOpen(true)}
          aria-expanded={false}
          disabled={disabled}
        >
          <RightOutlined style={{ fontSize: 10 }} /> Add a note
        </Typography.Link>
      )}
      {noteOpen && !draft.note && (
        <Typography.Link style={{ fontSize: 12 }} onClick={() => setNoteOpen(false)} aria-expanded>
          <DownOutlined style={{ fontSize: 10 }} /> Hide note
        </Typography.Link>
      )}
    </Form>
  );
}
