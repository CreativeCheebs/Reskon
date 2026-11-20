import { useRef, useState } from "react";
import { Alert, Button, Dropdown, Segmented, Select, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, CloseOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import type { RoundKind, Task } from "../types";
import { ContinueForm } from "./ContinueForm";
import { nextGrid, nextLabel } from "./nextLayout";
import { nextRound, type EpicChoice, type NextMode } from "./nextTask";
import { RoundTag, TaskTitle, titleText } from "./RoundTag";
import { daysFromToday } from "./SnoozeForecast";
import { intervalLabel, snoozeIntervals } from "./snoozeIntervals";

// The "What's next?" box in the task panel (SPEC 4.17): Continue (a new,
// different task that comes after this one), Next round (the same task
// again) or Skip. It opens under the panel title after the task is moved to a
// done status, or from the panel's and the card's actions at any time.

interface Props {
  task: Task;
  /** The form open first. */
  mode: NextMode;
  onClose: () => void;
  /** A task was made: the old one may have changed too (an epic, round #1). */
  onMade: (made: Task, epic?: EpicChoice) => void;
  onOpenTask: (id: number) => void;
}

export function WhatsNext({ task, mode, onClose, onMade, onOpenTask }: Props) {
  const T = useTerms();
  const canRound = task.type !== "epic";
  const [choice, setChoice] = useState<NextMode>(canRound ? mode : "continue");
  const [made, setMade] = useState<Task | null>(null);

  const done = (t: Task, epic?: EpicChoice) => {
    setMade(t);
    onMade(t, epic);
  };

  return (
    <section
      aria-label="What's next?"
      style={{ border: `1px solid ${palette.border}`, background: palette.panelDim, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ whiteSpace: "nowrap" }}>What's next?</strong>
        {!made && (
          <Segmented<NextMode>
            size="small"
            aria-label="What comes next"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "continue", label: "Continue", title: `A new ${T.task} that comes after this one` },
              ...(canRound ? [{ value: "round" as const, label: "Next round", title: "The same task again, with its own hours and points" }] : []),
            ]}
          />
        )}
        {made ? (
          <Button size="small" type="text" icon={<CloseOutlined />} aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }} />
        ) : (
          <Tooltip title="Nothing comes next: close this">
            <Button size="small" type="text" onClick={onClose} style={{ marginLeft: "auto", color: palette.muted }}>
              Skip
            </Button>
          </Tooltip>
        )}
      </div>
      {made ? (
        <Alert
          type="success"
          showIcon
          message={
            <span>
              Made <strong>{titleText(made)}</strong>.
            </span>
          }
          action={
            <Button size="small" onClick={() => onOpenTask(made.id)}>
              Open it
            </Button>
          }
        />
      ) : (
        <>
          {/* Both stay mounted, so switching keeps what was typed. */}
          <div hidden={choice !== "continue"}>
            <ContinueForm task={task} onMade={done} />
          </div>
          {canRound && (
            <div hidden={choice !== "round"}>
              <RoundForm task={task} onMade={done} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The Next round form: rounds or versions (for a task's first next round),
 *  and when the next one comes back: right away, or snoozed. */
export function RoundForm({ task, onMade }: { task: Task; onMade: (t: Task) => void }) {
  const { boot, online } = useApp();
  const first = task.round_no === null;
  const [kind, setKind] = useState<RoundKind>(task.round_kind ?? "round");
  const [days, setDays] = useState(0); // 0: right away
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // one round per click, however quick
  const [error, setError] = useState<string | null>(null);
  const word = kind === "version" ? "version" : "round";

  const submit = async () => {
    if (!online || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      onMade(await nextRound(task.id, { kind, snooze_until: days ? daysFromToday(days) : null }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={nextGrid}>
        <span style={nextLabel}>Next {word}</span>
        <div style={{ fontSize: 13, lineHeight: 1.5, minWidth: 0 }}>
          {first ? (
            <>
              <strong>
                {task.title}
                <RoundTag no={2} kind={kind} bg={palette.panelDim} />
              </strong>
              <div style={{ color: palette.muted, fontSize: 12 }}>
                Same details. This one becomes <RoundTag no={1} kind={kind} bg={palette.panelDim} />.
              </div>
            </>
          ) : (
            <>
              <strong>{task.title}</strong>
              <div style={{ color: palette.muted, fontSize: 12 }}>
                Same details, numbered after <TaskTitle task={task} bg={palette.panelDim} />.
              </div>
            </>
          )}
        </div>
        {first && (
          <>
            <span style={nextLabel}>Count as</span>
            <div>
              <Segmented<RoundKind>
                size="small"
                aria-label="Count it as"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "round", label: "Rounds" },
                  { value: "version", label: "Versions" },
                ]}
              />
            </div>
          </>
        )}
        <span style={nextLabel}>Comes back</span>
        <div>
          <Select<number>
            size="small"
            style={{ width: 150 }}
            aria-label="Bring the next one back"
            value={days}
            onChange={setDays}
            options={[{ value: 0, label: "Right away" }, ...snoozeIntervals(boot.settings).map((n) => ({ value: n, label: `In ${intervalLabel(n).toLowerCase()}` }))]}
          />
          {days > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              Off the board until then
            </Typography.Text>
          )}
        </div>
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ padding: "4px 10px" }} />}
      <Button type="primary" loading={busy} disabled={!online} onClick={submit} style={{ alignSelf: "flex-end" }}>
        Start next {word}
      </Button>
    </div>
  );
}

/** The panel's "What's next" button: Continue or Start next round, for a
 *  task in any status (an epic has no rounds). */
export function NextButton({ task, disabled, onPick }: { task: Task; disabled: boolean; onPick: (m: NextMode) => void }) {
  const T = useTerms();
  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled}
      menu={{
        items: [
          { key: "continue", label: `Continue with a new ${T.task}…` },
          ...(task.type !== "epic" ? [{ key: "round", label: "Start next round" }] : []),
        ],
        onClick: ({ key }) => onPick(key as NextMode),
      }}
    >
      <Button size="small" icon={<ArrowRightOutlined />}>
        Next
      </Button>
    </Dropdown>
  );
}
