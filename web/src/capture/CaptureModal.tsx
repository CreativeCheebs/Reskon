import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Modal, Radio, Select, Space, Spin, Typography, type InputRef } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { local } from "../offline";
import type { CaptureParse, Task, TaskBrief } from "../types";
import { DifficultySlider } from "../task/DifficultySlider";
import { emptySession, sessionBody, sessionReady, SessionFields, type SessionDraft } from "../sessions/SessionForm";
import { TagSelect } from "../tags/TagSelect";
import { useTags } from "../tags/tags";
import { priorityOptions } from "../task/LevelIcons";
import { defaultPriorityId } from "../task/defaultPriority";
import { palette } from "../theme/palette";
import { today } from "../format";
import { SimilarTasksList, useSimilarTasks } from "../task/SimilarTasks";
import { SnoozeField } from "../task/SnoozeField";
import { useTerms } from "../terms";

// Quick capture: one line in, filled forms out, nothing written until the
// user confirms. One line can hold several entries ("6 hours at the
// hospital, work was only 1 of them"); each gets its own form and Save
// writes them all. Enter saves, Escape cancels. If the parser is off or
// slow the server returns the manual form with the raw text as the title.

interface TaskDraft {
  title: string;
  area_id: number | null;
  energy_type_id: number | null;
  difficulty: number | null;
  priority_id: number | null;
  /** Tags by name; new names are made when it is saved. */
  tags: string[];
  /** A local date (YYYY-MM-DD) to hide the new task until; null = not snoozed. */
  snooze_until: string | null;
}

type Intent = "task" | "session";
const LAST_AREA = "jitterbug.lastAreaId";

interface Entry {
  id: number;
  parse: CaptureParse;
  intent: Intent | null;
  task: TaskDraft;
  session: SessionDraft;
}

let nextEntryId = 1;

interface Props {
  onClose: () => void;
  /** Keys typed before the input had focus (the Ctrl/⌘+K route). */
  takeEarlyKeys?: () => string;
  /** A line to read straight away, from the inbox. */
  initialText?: string;
  /** Everything was saved (called before onClose). */
  onSaved?: () => void;
}

export function CaptureModal({ onClose, takeEarlyKeys, initialText, onSaved }: Props) {
  const { boot, online } = useApp();
  const { refreshIfNew } = useTags();
  const T = useTerms();
  const [text, setText] = useState(initialText ?? "");
  const [parsing, setParsing] = useState(false);
  const [parse, setParse] = useState<CaptureParse | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  // While the line is typed: tasks like it, so a duplicate shows up first.
  const similar = useSimilarTasks(text, { enabled: !parse });
  const inputRef = useRef<InputRef>(null);

  // Whether a provider is set up, asked as the dialog opens, so a missing
  // one is said before anything is typed rather than after.
  const [noProvider, setNoProvider] = useState(false);
  useEffect(() => {
    api.get<TaskBrief[]>("/tasks?brief=1").then((list) => setTasks((all) => [...list, ...all.filter((n) => !list.some((x) => x.id === n.id))])).catch(() => undefined);
    api
      .get<{ endpoint: string; model: string }>("/capture/config")
      .then((c) => setNoProvider(!c.endpoint || !c.model))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (parse) setTimeout(() => saveRef.current?.focus(), 50);
  }, [parse]);
  // An inbox line is read as soon as the dialog opens.
  useEffect(() => {
    if (initialText) runParse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idByName = <T extends { id: number; name: string }>(rows: T[], name: string | null) =>
    name ? rows.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;

  const toEntry = (p: CaptureParse, raw: string): Entry => {
    // A task must have an area, so it falls back to the last one used; a
    // session only gets the area the text gave, never a guess.
    const lastArea = Number(local.get(LAST_AREA)) || null;
    const parsedArea = idByName(boot.areas, p.area);
    const areaId = parsedArea ?? (boot.areas.some((a) => a.id === lastArea) ? lastArea : boot.areas[0]?.id ?? null);
    const energyId = idByName(boot.energy_types, p.energy_type);
    // Several energy types in one activity: the first is the entry's own.
    const parts = (p.energies ?? []).map((e) => ({
      energy_type_id: idByName(boot.energy_types, e.energy_type),
      share: e.share,
      difficulty: e.difficulty,
    }));
    const several = parts.length > 1 && parts.every((x) => x.energy_type_id);
    const subtypeIds = (p.subtypes ?? [])
      .map((n) => boot.subtypes.find((s) => s.name.toLowerCase() === n.toLowerCase() && (!energyId || s.energy_type_id === energyId))?.id)
      .filter((x): x is number => x !== undefined)
      .slice(0, 4);
    return {
      id: nextEntryId++,
      parse: p,
      intent: p.intent === "session" ? "session" : p.intent === "task" ? "task" : null,
      task: { title: p.title ?? raw, area_id: areaId, energy_type_id: energyId, difficulty: p.difficulty, priority_id: defaultPriorityId(boot.settings, boot.priorities), tags: p.tags ?? [], snooze_until: null },
      session: emptySession({
        task_id: p.matched_task_id ?? null,
        label: p.matched_task_id ? "" : p.title ?? raw,
        area_id: parsedArea,
        // Events never get a task from capture.
        kind: p.kind === "event" ? "event" : "task",
        energy_type_id: energyId,
        hours: p.hours,
        difficulty: p.difficulty,
        ...(several ? { share: parts[0].share, more: parts.slice(1) } : {}),
        subtypes: subtypeIds,
        tags: p.tags ?? [],
        // The title is shortened by the model, so the line as typed is kept
        // as the note.
        note: raw && !p.fallback && p.title && p.title !== raw ? raw : "",
      }),
    };
  };

  const runParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    let p: CaptureParse;
    try {
      p = await api.post<CaptureParse>("/capture", { text });
    } catch (e) {
      // Even a failed request leaves the manual form usable.
      p = { ...emptyParse(), title: text.trim(), fallback: true, fallback_reason: (e as Error).message };
    }
    setParsing(false);
    setParse(p);
    setEntries((p.entries?.length ? p.entries : [p]).map((e) => toEntry(e, text.trim())));
  };

  const update = (id: number, patch: Partial<Entry>) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: number) => setEntries((es) => es.filter((e) => e.id !== id));
  const addEntry = () => {
    const e = toEntry({ ...emptyParse(), intent: "session", title: "" }, "");
    e.session = { ...e.session, note: text.trim() };
    setEntries((es) => [...es, e]);
  };

  const audit = (e: Entry) => ({ _capture: { raw: text, parse: e.parse, entries: entries.length, at: new Date().toISOString() } });

  const saveOne = async (e: Entry) => {
    if (e.intent === "task") {
      const t = e.task;
      if (!t.title.trim() || !t.area_id) throw new Error(`Every ${T.task} needs a title and an area.`);
      const body: Record<string, unknown> = { title: t.title.trim(), area_id: t.area_id, custom: audit(e), today: today() };
      if (t.energy_type_id) body.energy_type_id = t.energy_type_id;
      if (t.difficulty) body.difficulty = t.difficulty;
      body.priority_id = t.priority_id; // null is an explicit None
      if (t.tags.length) body.tags = t.tags;
      if (t.snooze_until) body.snooze_until = t.snooze_until;
      await api.post<Task>("/tasks", body);
      local.set(LAST_AREA, String(t.area_id));
    } else if (e.intent === "session") {
      const body = sessionBody(e.session);
      await api.post("/sessions", { ...body, custom: { ...body.custom, ...audit(e) } });
    }
  };

  // Saves entries one by one. A saved entry leaves the list, so after an
  // error only the ones still to save remain and Save can be pressed again.
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    let tasksAdded = 0;
    let sessionsLogged = 0;
    try {
      for (const e of entries) {
        await saveOne(e);
        if (e.intent === "task") tasksAdded++;
        else sessionsLogged++;
        remove(e.id);
      }
      const parts = [
        tasksAdded ? `${T.countTasks(tasksAdded)} added` : "",
        sessionsLogged ? `${sessionsLogged} session${sessionsLogged > 1 ? "s" : ""} logged` : "",
      ].filter(Boolean);
      refreshIfNew(entries.flatMap((e) => (e.intent === "task" ? e.task.tags : e.session.tags)));
      message.success(parts.join(", ").replace(/^./, (c) => c.toUpperCase()));
      onSaved?.();
      onClose();
    } catch (err) {
      const done = tasksAdded + sessionsLogged;
      message.error(done ? `${done} saved; the next one failed: ${(err as Error).message}` : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Enter saves from anywhere in the form except multi-line fields, open
  // dropdowns and popovers (the Snooze until menu), which need Enter for themselves.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || !parse) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.closest(".ant-select") || t.closest(".ant-picker") || t.closest(".ant-popover") || t.tagName === "BUTTON") return;
    e.preventDefault();
    save();
  };

  const entryReady = (e: Entry) =>
    e.intent === "task" ? !!e.task.title.trim() && !!e.task.area_id : e.intent === "session" ? sessionReady(e.session) : false;
  const canSave = online && !busy && entries.length > 0 && entries.every(entryReady);
  const several = entries.length > 1;
  const totalHours = entries.reduce((n, e) => n + (e.intent === "session" ? e.session.hours ?? 0 : 0), 0);

  return (
    <Modal
      open
      width={580}
      title="Quick capture"
      onCancel={onClose}
      keyboard
      destroyOnClose
      // No open animation: keystrokes typed straight after Ctrl+K must land
      // in the input, not in a modal that is still fading in.
      transitionName=""
      maskTransitionName=""
      afterOpenChange={(open) => open && inputRef.current?.focus()}
      footer={
        parse ? (
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button ref={saveRef} type="primary" disabled={!canSave} loading={busy} onClick={save}>
              {several ? `Save ${entries.length}` : "Save"}
            </Button>
          </Space>
        ) : null
      }
    >
      <div role="presentation" onKeyDown={onKeyDown}>
        {!parse ? (
          <Spin spinning={parsing} tip="Reading…">
            {noProvider && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 10, padding: "6px 12px" }}
                message="No capture provider is set up"
                description={
                  <>
                    What you type opens the manual form to fill in by hand.{" "}
                    <a href="#/settings/capture" onClick={onClose}>
                      Set one up in Settings → Quick capture
                    </a>
                  </>
                }
              />
            )}
            <Input
              ref={inputRef}
              data-capture-input
              autoFocus
              size="large"
              placeholder="Worked on stm32 demo, 2 hours · Need to order a replacement NVR drive"
              value={text}
              disabled={!online}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={runParse}
              onFocus={() => {
                const typed = takeEarlyKeys?.() ?? "";
                if (typed) setText((t) => typed + t);
              }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Enter to read it · Esc to close · past tense logs a session, future or imperative makes {T.tasks} · one line can hold several
            </Typography.Text>
            <SimilarTasksList {...similar} />
          </Spin>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            {parse.fallback && (
              <Alert type="info" showIcon message="Filled in by hand" description={parse.fallback_reason} style={{ padding: "4px 10px" }} />
            )}
            {several && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Read as {entries.length} entries{totalHours ? ` · ${Number(totalHours.toFixed(2))} h in all` : ""}. Check each, remove any you don't want.
              </Typography.Text>
            )}
            {entries.map((e, i) => (
              <div
                key={e.id}
                style={several ? { border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px 2px" } : undefined}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {several && <Typography.Text strong style={{ fontSize: 12 }}>{i + 1}.</Typography.Text>}
                  {/* Radio, not Segmented: Segmented shows its first option as
                      selected when nothing is, which would be a silent guess. */}
                  <Radio.Group value={e.intent} onChange={(ev) => update(e.id, { intent: ev.target.value })} optionType="button" buttonStyle="solid" size={several ? "small" : "middle"}>
                    <Radio.Button value="task">{T.Task}</Radio.Button>
                    <Radio.Button value="session">Session</Radio.Button>
                  </Radio.Group>
                  {several && (
                    <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => remove(e.id)} aria-label="Remove this entry" style={{ marginLeft: "auto" }} />
                  )}
                </div>
                {!e.intent && <Typography.Text type="secondary">Is this {T.task} to do, or a session that happened?</Typography.Text>}
                {e.intent === "task" && <TaskFields draft={e.task} onChange={(task) => update(e.id, { task })} />}
                {e.intent === "session" && (
                  <SessionFields draft={e.session} onChange={(session) => update(e.id, { session })} tasks={tasks} onTaskCreated={(t) => setTasks((all) => [...all, t])} disabled={!online} />
                )}
              </div>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addEntry}>
              Add entry
            </Button>
          </Space>
        )}
      </div>
    </Modal>
  );
}

function TaskFields({ draft, onChange }: { draft: TaskDraft; onChange: (d: TaskDraft) => void }) {
  const { boot } = useApp();
  const set = (p: Partial<TaskDraft>) => onChange({ ...draft, ...p });
  const opt = <T extends { id: number; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  const similar = useSimilarTasks(draft.title);
  return (
    <Form layout="vertical" size="small">
      <Form.Item label="Title" required style={{ marginBottom: 8 }}>
        <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        <SimilarTasksList {...similar} />
      </Form.Item>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Form.Item label="Area" required style={{ marginBottom: 8 }}>
          <Select
            value={draft.area_id ?? undefined}
            onChange={(v) => {
              const area = boot.areas.find((a) => a.id === v);
              set({ area_id: v, energy_type_id: draft.energy_type_id ?? area?.default_energy_type_id ?? null });
            }}
            options={opt(boot.areas)}
          />
        </Form.Item>
        <Form.Item label="Energy type" help="Blank takes the area default" style={{ marginBottom: 8 }}>
          <Select allowClear value={draft.energy_type_id ?? undefined} onChange={(v) => set({ energy_type_id: v ?? null })} options={opt(boot.energy_types)} />
        </Form.Item>
        <Form.Item label="Level" style={{ marginBottom: 8 }}>
          <DifficultySlider value={draft.difficulty} width={230} onChange={(v) => set({ difficulty: v })} />
        </Form.Item>
        <Form.Item label="Priority" style={{ marginBottom: 8 }}>
          <Select allowClear value={draft.priority_id ?? undefined} onChange={(v) => set({ priority_id: v ?? null })} options={priorityOptions(boot.priorities)} />
        </Form.Item>
        <Form.Item label="Tags" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
          <TagSelect value={draft.tags} onChange={(tags) => set({ tags })} />
        </Form.Item>
        <Form.Item label="Snooze until" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
          <SnoozeField value={draft.snooze_until} onChange={(snooze_until) => set({ snooze_until })} />
        </Form.Item>
      </div>
    </Form>
  );
}

function emptyParse(): CaptureParse {
  return {
    intent: null,
    kind: null,
    title: null,
    energy_type: null,
    hours: null,
    difficulty: null,
    subtypes: null,
    tags: null,
    area: null,
    matched_task_key: null,
    confidence: null,
  };
}
