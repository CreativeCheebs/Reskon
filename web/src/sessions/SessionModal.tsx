import { useEffect, useState } from "react";
import { Button, Modal, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import type { Session, TaskBrief } from "../types";
import { draftFromSession, emptySession, pointsInputsChanged, sessionBody, sessionReady, SessionFields, type SessionDraft } from "./SessionForm";
import { palette } from "../theme/palette";

// The manual log form. Also used to edit an existing session.

export function SessionModal({
  initial,
  editing,
  onClose,
  onSaved,
}: {
  initial?: Partial<SessionDraft>;
  editing?: Session;
  onClose: () => void;
  onSaved: (s: Session) => void;
}) {
  const { online } = useApp();
  const [draft, setDraft] = useState<SessionDraft>(() =>
    editing
      ? emptySession({
          task_id: editing.task_id,
          label: editing.label ?? "",
          area_id: editing.area_id,
          kind: editing.kind,
          hours: editing.hours,
          points: editing.points,
          ...draftFromSession(editing),
          subtypes: editing.subtypes.map((s) => s.subtype_id),
          logged_for: editing.logged_for,
          started_at: editing.started_at,
          note: editing.note ?? "",
          custom: editing.custom,
        })
      : emptySession(initial),
  );
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [busy, setBusy] = useState(false);
  // Recalculate at today's rates on save, when only a rate has changed.
  const [recalc, setRecalc] = useState(false);

  useEffect(() => {
    api.get<TaskBrief[]>("/tasks?brief=1").then(setTasks).catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const body = sessionBody(draft);
      const s = editing
        ? await api.patch<Session>(`/sessions/${editing.id}`, { ...body, ...(recalc ? { recalculate: true } : {}) })
        : await api.post<Session>("/sessions", body);
      onSaved(s);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      width={560}
      centered
      title={editing ? "Edit session" : "Log time"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      // The form scrolls; the header and the Save / Cancel row stay put.
      styles={{ body: { maxHeight: "calc(100vh - 200px)", overflowY: "auto", overflowX: "hidden", padding: "4px 2px 4px 0" } }}
      okButtonProps={{
        loading: busy,
        disabled: !online || !sessionReady(draft),
        title: online ? undefined : OFFLINE_TIP,
      }}
    >
      <SessionFields draft={draft} onChange={setDraft} tasks={tasks} disabled={!online} autoFocus={!editing} />
      {editing && <PointsLine editing={editing} draft={draft} recalc={recalc} onRecalc={() => setRecalc(true)} />}
    </Modal>
  );
}

// PointsLine: a session's stored points, read-only. Points follow edits to
// what they depend on; a rate change alone only offers a recalculation.
function PointsLine({ editing, draft, recalc, onRecalc }: { editing: Session; draft: SessionDraft; recalc: boolean; onRecalc: () => void }) {
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "none" : String(Number(n.toFixed(2))));
  const now = editing.points_now;
  const stale = now !== null && Math.abs(now - (editing.points ?? 0)) > 0.005;
  let note: React.ReactNode = null;
  if (pointsInputsChanged(draft, editing)) note = "Recalculated at today's rates when you save.";
  else if (recalc) note = `Will be ${fmt(now)} when you save.`;
  else if (stale)
    note = (
      <>
        Rates have changed since: today it would be {fmt(now)}.{" "}
        <Button size="small" type="link" style={{ padding: 0, height: "auto" }} onClick={onRecalc}>
          Recalculate
        </Button>
      </>
    );
  return (
    <div style={{ fontSize: 12, marginTop: 4 }}>
      <Typography.Text strong style={{ fontSize: 12 }}>Points</Typography.Text> {fmt(editing.points)}
      {note && <span style={{ color: palette.muted }}> · {note}</span>}
    </div>
  );
}
