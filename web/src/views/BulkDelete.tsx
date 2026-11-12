import { useState } from "react";
import { Checkbox, Input, Modal, Typography } from "antd";
import { api } from "../api";
import { message } from "../theme/feedback";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import type { Task } from "../types";

// Deleting several tasks at once. One task asks the usual yes or no. Several
// ask for more, because there is no undo: the word "delete" has to be typed
// out by hand (pasting is blocked), and the box says how many tasks go and
// what stays. All of them are deleted, or none.

/** The word that has to be typed to delete several tasks. */
export const DELETE_WORD = "delete";

/** Whether what was typed is the confirmation word. */
export function typedDelete(text: string): boolean {
  return text.trim().toLowerCase() === DELETE_WORD;
}

export function BulkDeleteModal({
  tasks: picked,
  onClose,
  onDeleted,
}: {
  tasks: Task[];
  onClose: () => void;
  onDeleted: (ids: number[]) => void;
}) {
  const T = useTerms();
  // What was chosen when the box opened: a refresh behind it must not change
  // what the person is agreeing to.
  const [tasks] = useState(picked);
  const [typed, setTyped] = useState("");
  const [withSubtasks, setWithSubtasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = tasks.length;
  const epics = tasks.filter((t) => t.type === "epic");
  // A subtask ticked together with its parent is already in the list, so it is not counted again.
  const chosen = new Set(tasks.map((t) => t.id));
  const subtasks = tasks.reduce((sum, t) => sum + t.subtask_count, 0) - tasks.filter((t) => t.parent_id !== null && chosen.has(t.parent_id)).length;
  const shown = tasks.slice(0, 5);

  const remove = async () => {
    setBusy(true);
    try {
      await api.post("/tasks/delete", { task_ids: tasks.map((t) => t.id), subtasks: withSubtasks ? "delete" : "keep" });
      message.success(`Deleted ${T.countTasks(n)}`);
      onDeleted(tasks.map((t) => t.id));
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
      title={`Delete ${T.countTasks(n)}?`}
      okText={`Delete ${n}`}
      okButtonProps={{ danger: true, disabled: !typedDelete(typed), loading: busy }}
      onOk={remove}
      onCancel={onClose}
      maskClosable={!busy}
      destroyOnHidden
    >
      <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
        {shown.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
        {n > shown.length && <li style={{ color: palette.muted }}>and {n - shown.length} more</li>}
      </ul>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        This cannot be undone. Time already logged on {n === 1 ? "it" : "them"} stays, without {T.task}.
        {epics.length > 0 && ` The ${epics.length === 1 ? T.epic : T.epics} you picked can go; ${epics.length === 1 ? `its ${T.tasks} stay` : `their ${T.tasks} stay`}, just no longer in ${epics.length === 1 ? `that ${T.epic}` : `those ${T.epics}`}.`}
      </Typography.Paragraph>
      {subtasks > 0 && (
        <Checkbox checked={withSubtasks} onChange={(e) => setWithSubtasks(e.target.checked)} style={{ marginBottom: 12 }}>
          Delete their {subtasks} subtask{subtasks === 1 ? "" : "s"} too (otherwise {subtasks === 1 ? "it stays" : "they stay"} as ordinary {T.tasks})
        </Checkbox>
      )}
      <div>
        <label htmlFor="bulk-delete-word" style={{ display: "block", marginBottom: 4 }}>
          To go ahead, type <strong>{DELETE_WORD}</strong>
        </label>
        <Input
          id="bulk-delete-word"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          // Typed out by hand, so it is a decision and not a reflex.
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onPressEnter={() => typedDelete(typed) && !busy && remove()}
          status={typed && !typedDelete(typed) && typed.length >= DELETE_WORD.length ? "error" : undefined}
          aria-invalid={typed.length >= DELETE_WORD.length && !typedDelete(typed)}
        />
      </div>
    </Modal>
  );
}
