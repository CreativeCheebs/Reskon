import { Button, Space } from "antd";
import { closeNote, notify } from "../theme/feedback";
import type { NextMode } from "../task/nextTask";
import { titleText } from "../task/RoundTag";
import type { Task } from "../types";

// After a card is dragged into a done column (SPEC 4.17): a small note,
// "Moved to Done. Continue it · Next round", that goes by itself after a few
// seconds. A drag is never stopped by a question; either button opens the
// task panel with its "What's next?" box.

export const DONE_NOTE_SECONDS = 8;

export function showDoneNote(task: Task, statusName: string, onOpen: (id: number, next: NextMode) => void) {
  const key = `done-note-${task.id}`;
  const open = (mode: NextMode) => {
    closeNote(key);
    onOpen(task.id, mode);
  };
  notify({
    key,
    placement: "bottomRight",
    duration: DONE_NOTE_SECONDS,
    message: `Moved to ${statusName}`,
    description: titleText(task),
    actions: (
      <Space size={6}>
        <Button size="small" type="primary" onClick={() => open("continue")}>
          Continue it
        </Button>
        {task.type !== "epic" && (
          <Button size="small" onClick={() => open("round")}>
            Next round
          </Button>
        )}
      </Space>
    ),
  });
}
