import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Modal, Radio, Select, Space, Spin, Typography, type InputRef } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { local } from "../offline";
import type { CaptureParse, Task } from "../types";
import { DifficultySlider } from "../task/DifficultySlider";
import { emptySession, sessionBody, SessionFields, type SessionDraft } from "../sessions/SessionForm";

// Quick capture: one line in, a filled form out, nothing written until the
// user confirms. Enter saves, Escape cancels. If the parser is off or slow
// the server returns the manual form with the raw text as the title.

interface TaskDraft {
  title: string;
  area_id: number | null;
  energy_type_id: number | null;
  difficulty: number | null;
  priority_id: number | null;
}

type Intent = "task" | "session";
const LAST_AREA = "jitterbug.lastAreaId";

export function CaptureModal({ onClose, takeEarlyKeys }: { onClose: () => void; takeEarlyKeys: () => string }) {
  const { boot, online } = useApp();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parse, setParse] = useState<CaptureParse | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [task, setTask] = useState<TaskDraft | null>(null);
  const [session, setSession] = useState<SessionDraft | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    api.get<Task[]>("/tasks").then(setTasks).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (parse) setTimeout(() => saveRef.current?.focus(), 50);
  }, [parse, intent]);

  const idByName = <T extends { id: number; name: string }>(rows: T[], name: string | null) =>
    name ? rows.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;

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

    const lastArea = Number(local.get(LAST_AREA)) || null;
    const areaId = idByName(boot.areas, p.area) ?? (boot.areas.some((a) => a.id === lastArea) ? lastArea : boot.areas[0]?.id ?? null);
    const energyId = idByName(boot.energy_types, p.energy_type);
    setIntent(p.intent === "session" ? "session" : p.intent === "task" ? "task" : null);
    setTask({
      title: p.title ?? text.trim(),
      area_id: areaId,
      energy_type_id: energyId,
      difficulty: p.difficulty,
      priority_id: null,
    });
    const subtypeIds = (p.subtypes ?? [])
      .map((n) => boot.subtypes.find((s) => s.name.toLowerCase() === n.toLowerCase() && (!energyId || s.energy_type_id === energyId))?.id)
      .filter((x): x is number => x !== undefined)
      .slice(0, 4);
    setSession(
      emptySession({
        task_id: p.matched_task_id ?? null,
        label: p.matched_task_id ? "" : p.title ?? text.trim(),
        area_id: areaId,
        // Events never get a task from capture.
        kind: p.kind === "event" ? "event" : "task",
        energy_type_id: energyId,
        hours: p.hours,
        difficulty: p.difficulty,
        subtypes: subtypeIds,
      }),
    );
  };

  const audit = () => ({ _capture: { raw: text, parse, at: new Date().toISOString() } });

  const save = async () => {
    if (!intent || busy) return;
    setBusy(true);
    try {
      if (intent === "task" && task) {
        if (!task.title.trim() || !task.area_id) throw new Error("A task needs a title and an area.");
        const body: Record<string, unknown> = { title: task.title.trim(), area_id: task.area_id, custom: audit() };
        if (task.energy_type_id) body.energy_type_id = task.energy_type_id;
        if (task.difficulty) body.difficulty = task.difficulty;
        if (task.priority_id) body.priority_id = task.priority_id;
        await api.post<Task>("/tasks", body);
        local.set(LAST_AREA, String(task.area_id));
        message.success("Task added");
      } else if (intent === "session" && session) {
        const body = sessionBody(session);
        await api.post("/sessions", { ...body, custom: { ...body.custom, ...audit() } });
        message.success("Session logged");
      }
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Enter saves from anywhere in the form except multi-line fields and
  // open dropdowns, which need Enter for themselves.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || !parse) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.closest(".ant-select") || t.closest(".ant-picker") || t.tagName === "BUTTON") return;
    e.preventDefault();
    save();
  };

  const canSave = online && !!intent && !busy && (intent === "task" ? !!task?.title.trim() && !!task?.area_id : !!session?.hours && !!session?.energy_type_id);

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
              Save
            </Button>
          </Space>
        ) : null
      }
    >
      <div onKeyDown={onKeyDown}>
        {!parse ? (
          <Spin spinning={parsing} tip="Reading…">
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
                const typed = takeEarlyKeys();
                if (typed) setText((t) => typed + t);
              }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Enter to read it · Esc to close · past tense logs a session, future or imperative makes a task
            </Typography.Text>
          </Spin>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            {parse.fallback && (
              <Alert type="info" showIcon message="Filled in by hand" description={parse.fallback_reason} style={{ padding: "4px 10px" }} />
            )}
            {/* Radio, not Segmented: Segmented shows its first option as
                selected when nothing is, which would be a silent guess. */}
            <Radio.Group value={intent} onChange={(e) => setIntent(e.target.value)} optionType="button" buttonStyle="solid">
              <Radio.Button value="task">Task</Radio.Button>
              <Radio.Button value="session">Session</Radio.Button>
            </Radio.Group>
            {!intent && <Typography.Text type="secondary">Is this a task to do, or a session that happened?</Typography.Text>}
            {intent === "task" && task && <TaskFields draft={task} onChange={setTask} />}
            {intent === "session" && session && <SessionFields draft={session} onChange={setSession} tasks={tasks} disabled={!online} />}
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
  return (
    <Form layout="vertical" size="small">
      <Form.Item label="Title" required style={{ marginBottom: 8 }}>
        <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
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
        <Form.Item label="Difficulty" style={{ marginBottom: 8 }}>
          <DifficultySlider value={draft.difficulty} width={230} onChange={(v) => set({ difficulty: v })} />
        </Form.Item>
        <Form.Item label="Priority" style={{ marginBottom: 8 }}>
          <Select allowClear value={draft.priority_id ?? undefined} onChange={(v) => set({ priority_id: v ?? null })} options={opt(boot.priorities)} />
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
    area: null,
    matched_task_key: null,
    confidence: null,
  };
}
