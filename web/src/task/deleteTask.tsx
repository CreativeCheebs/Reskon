import { Button, Space } from "antd";
import { api } from "../api";
import { confirm } from "../theme/feedback";
import type { Task } from "../types";
import type { Terms } from "../terms";

// Deleting a task asks first. A task with subtasks also asks what happens
// to them: deleted with it, or kept as ordinary tasks.
export function deleteTaskAsking(task: Task, onDeleted: (id: number) => void, onError: (e: Error) => void, T: Terms) {
  const del = async (subtasks: "delete" | "keep") => {
    try {
      await api.del(`/tasks/${task.id}${subtasks === "delete" ? "?subtasks=delete" : ""}`);
      onDeleted(task.id);
    } catch (e) {
      onError(e as Error);
    }
  };
  const n = task.subtask_count;
  if (!n) {
    confirm({
      title: `Delete “${task.title}”?`,
      content: task.type === "epic" ? `Its ${T.tasks} are not deleted: they stay, just no longer in this ${T.epic}.` : undefined,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => del("keep"),
    });
    return;
  }
  const dialog = confirm({
    title: `Delete “${task.title}”?`,
    content: `It has ${n} subtask${n === 1 ? "" : "s"}. Delete ${n === 1 ? "it" : "them"} too, or keep ${n === 1 ? `it as a normal ${T.task}` : `them as normal ${T.tasks}`}?`,
    footer: (
      <Space style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Button onClick={() => dialog.destroy()}>Cancel</Button>
        <Button onClick={() => { dialog.destroy(); void del("keep"); }}>Keep subtasks</Button>
        <Button danger type="primary" onClick={() => { dialog.destroy(); void del("delete"); }}>
          Delete with subtasks
        </Button>
      </Space>
    ),
  });
}
