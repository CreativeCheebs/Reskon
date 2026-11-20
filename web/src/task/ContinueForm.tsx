import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Radio, Select, Space, Typography } from "antd";
import { api } from "../api";
import { today } from "../format";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import type { Task } from "../types";
import { TypeIcon } from "./TypeIcon";
import { useEpics } from "./useEpics";
import { COPY_KEYS, continueTask, epicCaseOf, type ContinueBody, type CopyKey, type EpicChoice } from "./nextTask";

// The Continue form of the "What's next?" box (SPEC 4.17): the next task's
// title, what it copies, and the epic question that fits the old task.
// Typed text stays when the server refuses, so nothing has to be typed again.

const COPY_LABELS: Record<CopyKey, string> = { energy_type: "Energy type", priority: "Priority", level: "Level", tags: "Tags" };

/** The epic choice a task starts with: an epic for both when it has none,
 *  the same epic when it has one, otherwise no epic question at all. */
export function defaultEpicChoice(t: Task): EpicChoice {
  const c = epicCaseOf(t);
  return c === "free" ? "new" : c === "in_epic" ? "same" : "none";
}

export function ContinueForm({ task, onMade }: { task: Task; onMade: (t: Task, epic: EpicChoice) => void }) {
  const T = useTerms();
  const { online } = useApp();
  const { epics, byId } = useEpics();
  const kase = epicCaseOf(task);
  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState<CopyKey[]>([...COPY_KEYS]);
  const [epic, setEpic] = useState<EpicChoice>(defaultEpicChoice(task));
  const [epicTitle, setEpicTitle] = useState(task.title);
  const [pickId, setPickId] = useState<number | null>(null);
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  // busy for a second Enter before the screen has redrawn: one task only.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // The task changed while the box was open (moved into an epic, made a
  // subtask ...): its epic question changes, so the choice starts over.
  const [shownCase, setShownCase] = useState(kase);
  if (shownCase !== kase) {
    setShownCase(kase);
    setEpic(defaultEpicChoice(task));
    setSeparate(false);
  }

  // A subtask's choice names its parent.
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  useEffect(() => {
    if (task.parent_id === null) return;
    api
      .get<Task>(`/tasks/${task.parent_id}`)
      .then((p) => setParentTitle(p.title))
      .catch(() => undefined);
  }, [task.parent_id]);

  const toggle = (k: CopyKey, on: boolean) => setCopy((cur) => COPY_KEYS.filter((x) => (x === k ? on : cur.includes(x))));

  const submit = async () => {
    if (!online || busyRef.current) return;
    if (!title.trim()) {
      setError(`The next ${T.task} needs a title.`);
      return;
    }
    if (epic === "pick" && pickId === null) {
      setError(`Choose an ${T.epic}.`);
      return;
    }
    const body: ContinueBody = { title: title.trim(), copy, epic, separate: kase === "subtask" && separate, today: today() };
    if (epic === "new") body.epic_title = epicTitle.trim() || task.title;
    if (epic === "pick" && pickId !== null) body.epic_id = pickId;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      onMade(await continueTask(task.id, body), epic);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // A field that belongs to a choice sits under it, not inside its label,
  // so clicking the field never clicks the radio.
  const choice = (value: string, label: React.ReactNode, extra?: React.ReactNode) => (
    <div>
      <Radio value={value}>{label}</Radio>
      {extra && <div style={{ margin: "6px 0 0 24px" }}>{extra}</div>}
    </div>
  );
  const epicName = (name: string) => (
    <span style={{ color: palette.epic }}>
      <TypeIcon type="epic" /> {name}
    </span>
  );

  let where: React.ReactNode = null;
  if (kase === "free")
    where = (
      <Radio.Group aria-label={`Link both with an ${T.epic}`} value={epic} onChange={(e) => setEpic(e.target.value)}>
        <Space direction="vertical" size={6}>
          {choice(
            "new",
            `Make an ${T.epic} for both`,
            epic === "new" && (
              <Input size="small" style={{ width: 260 }} aria-label={`${T.Epic} name`} value={epicTitle} onChange={(e) => setEpicTitle(e.target.value)} />
            ),
          )}
          {choice(
            "pick",
            `Put both in an ${T.epic} I already have`,
            epic === "pick" && (
              <Select
                size="small"
                style={{ width: 260 }}
                showSearch
                optionFilterProp="search"
                placeholder={`Choose an ${T.epic}`}
                aria-label={`Choose an ${T.epic}`}
                value={pickId ?? undefined}
                onChange={(v) => setPickId(v)}
                options={epics.map((e) => ({ value: e.id, search: e.title.toLowerCase(), label: e.title }))}
              />
            ),
          )}
          {choice("none", `No ${T.epic}, just link them`)}
        </Space>
      </Radio.Group>
    );
  else if (kase === "in_epic")
    where = (
      <Radio.Group aria-label={T.Epic} value={epic} onChange={(e) => setEpic(e.target.value)}>
        <Space direction="vertical" size={6}>
          {choice("same", <>Keep both in {epicName(byId.get(task.epic_id!)?.title ?? `its ${T.epic}`)}</>)}
          {choice("none", `New ${T.task} has no ${T.epic}`)}
        </Space>
      </Radio.Group>
    );
  else if (kase === "subtask")
    where = (
      <Radio.Group aria-label="Where does it go" value={separate ? "own" : "sub"} onChange={(e) => setSeparate(e.target.value === "own")}>
        <Space direction="vertical" size={6}>
          {choice("sub", <>Next subtask of {parentTitle ? <strong>{parentTitle}</strong> : "the same parent"}</>)}
          {choice("own", `A separate ${T.task}`)}
        </Space>
      </Radio.Group>
    );
  else
    where = (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        An {T.epic} can't be inside another {T.epic}, so the next one is an {T.epic} too.
      </Typography.Text>
    );

  const label = (text: string) => <div style={{ fontSize: 12, color: palette.muted, marginBottom: 4 }}>{text}</div>;
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <div>
        {label(`Next ${T.task}`)}
        <Input
          autoFocus
          aria-label={`Next ${T.task} title`}
          placeholder={`What comes after “${task.title}”?`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={submit}
        />
      </div>
      <div>
        {label(`Copy from this ${T.task} (click to leave out)`)}
        <div role="group" aria-label={`Copy from this ${T.task}`}>
          <Space size={6} wrap>
            {COPY_KEYS.map((k) => {
              const on = copy.includes(k);
              return (
                <Button key={k} size="small" shape="round" type={on ? "primary" : "default"} ghost={on} aria-pressed={on} onClick={() => toggle(k, !on)}>
                  {COPY_LABELS[k]}
                </Button>
              );
            })}
          </Space>
        </div>
      </div>
      <div>
        {kase !== "epic" && label(kase === "subtask" ? "Where does it go" : T.Epic)}
        {where}
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ padding: "4px 10px" }} />}
      <Space size={10} align="center">
        <Button type="primary" loading={busy} disabled={!online} onClick={submit}>
          Create next {T.task}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Starts in the first to-do status
        </Typography.Text>
      </Space>
    </Space>
  );
}
