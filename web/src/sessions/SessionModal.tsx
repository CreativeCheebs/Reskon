import { useEffect, useState } from "react";
import { Modal, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import type { Session, Task } from "../types";
import { emptySession, sessionBody, SessionFields, type SessionDraft } from "./SessionForm";

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
          energy_type_id: editing.energy_type_id,
          hours: editing.hours,
          difficulty: editing.difficulty,
          subtypes: editing.subtypes.map((s) => s.subtype_id),
          logged_for: editing.logged_for,
          started_at: editing.started_at,
          note: editing.note ?? "",
          custom: editing.custom,
        })
      : emptySession(initial),
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Task[]>("/tasks").then(setTasks).catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const body = sessionBody(draft);
      const s = editing ? await api.patch<Session>(`/sessions/${editing.id}`, body) : await api.post<Session>("/sessions", body);
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
      title={editing ? "Edit session" : "Log time"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{
        loading: busy,
        disabled: !online || !draft.hours || !draft.energy_type_id,
        title: online ? undefined : OFFLINE_TIP,
      }}
    >
      <SessionFields draft={draft} onChange={setDraft} tasks={tasks} disabled={!online} />
    </Modal>
  );
}
