import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { api } from "../api";
import { today } from "../format";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import type { Task } from "../types";
import { TypeIcon } from "./TypeIcon";
import { nextGrid, nextLabel } from "./nextLayout";
import { useEpics } from "./useEpics";
import { COPY_KEYS, continueTask, epicCaseOf, type ContinueBody, type CopyKey, type EpicChoice } from "./nextTask";

// The Continue form of the "What's next?" box (SPEC 4.17): the next task's
// title, what it copies, and the epic question that fits the old task.
// Typed text stays when the server refuses, so nothing has to be typed again.
// It is kept short: the title and its Create button on one line, then one
// line each for the epic and for what it copies.

const COPY_LABELS: Record<CopyKey, string> = { energy_type: "Energy", priority: "Priority", level: "Level", tags: "Tags" };

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

  const epicName = (name: string) => (
    <span style={{ color: palette.epic }}>
      <TypeIcon type="epic" /> {name}
    </span>
  );

  // One short row: a label on the left, the choice and its field beside it.
  const row = (label: string, body: React.ReactNode) => (
    <>
      <span style={nextLabel}>{label}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>{body}</div>
    </>
  );

  let where: React.ReactNode;
  if (kase === "free")
    where = row(
      T.Epic,
      <>
        <Select<EpicChoice>
          size="small"
          style={{ width: 170 }}
          aria-label={`Link both with an ${T.epic}`}
          value={epic}
          onChange={setEpic}
          options={[
            { value: "new", label: `New ${T.epic} for both` },
            { value: "pick", label: `An ${T.epic} I have` },
            { value: "none", label: `No ${T.epic}` },
          ]}
        />
        {epic === "new" && (
          <Input size="small" style={{ flex: 1, minWidth: 100 }} aria-label={`${T.Epic} name`} value={epicTitle} onChange={(e) => setEpicTitle(e.target.value)} onPressEnter={submit} />
        )}
        {epic === "pick" && (
          <Select
            size="small"
            style={{ flex: 1, minWidth: 100 }}
            showSearch
            optionFilterProp="search"
            placeholder={`Choose an ${T.epic}`}
            aria-label={`Choose an ${T.epic}`}
            value={pickId ?? undefined}
            onChange={(v) => setPickId(v)}
            options={epics.map((e) => ({ value: e.id, search: e.title.toLowerCase(), label: e.title }))}
          />
        )}
      </>,
    );
  else if (kase === "in_epic")
    where = row(
      T.Epic,
      <Select<EpicChoice>
        size="small"
        style={{ flex: 1, minWidth: 0 }}
        aria-label={T.Epic}
        value={epic}
        onChange={setEpic}
        options={[
          { value: "same", label: <>Keep both in {epicName(byId.get(task.epic_id!)?.title ?? `its ${T.epic}`)}</> },
          { value: "none", label: `New ${T.task} has no ${T.epic}` },
        ]}
      />,
    );
  else if (kase === "subtask")
    where = row(
      "Goes",
      <Select<"sub" | "own">
        size="small"
        style={{ flex: 1, minWidth: 0 }}
        aria-label="Where does it go"
        value={separate ? "own" : "sub"}
        onChange={(v) => setSeparate(v === "own")}
        options={[
          { value: "sub", label: <>Next subtask of {parentTitle ? <strong>{parentTitle}</strong> : "the same parent"}</> },
          { value: "own", label: `A separate ${T.task}` },
        ]}
      />,
    );
  else
    where = row(
      T.Epic,
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        The next one is an {T.epic} too.
      </Typography.Text>,
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          autoFocus
          aria-label={`Next ${T.task} title`}
          placeholder={`What comes after “${task.title}”?`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={submit}
        />
        <Button type="primary" loading={busy} disabled={!online} onClick={submit}>
          Create {T.task}
        </Button>
      </Space.Compact>
      <div style={nextGrid}>
        {where}
        {row(
          "Copy over",
          <div role="group" aria-label={`Copy from this ${T.task}`} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {COPY_KEYS.map((k) => {
              const on = copy.includes(k);
              return (
                <Button
                  key={k}
                  size="small"
                  type={on ? "primary" : "default"}
                  ghost={on}
                  aria-pressed={on}
                  icon={<CheckOutlined aria-hidden style={{ visibility: on ? "visible" : "hidden" }} />}
                  onClick={() => toggle(k, !on)}
                  style={{ fontSize: 12, paddingInline: 8 }}
                >
                  {COPY_LABELS[k]}
                </Button>
              );
            })}
          </div>,
        )}
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ padding: "4px 10px" }} />}
    </div>
  );
}
