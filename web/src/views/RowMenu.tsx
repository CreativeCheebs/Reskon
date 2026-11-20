import { useEffect, useState } from "react";
import { Dropdown, Modal } from "antd";
import { NoteEditor, useCardActions, type CardHandlers } from "../board/CardActions";
import { SessionModal } from "../sessions/SessionModal";
import type { Task } from "../types";
import { TaskTitle, titleText } from "../task/RoundTag";

// The right-click menu of a table row: the same actions, in the same order,
// as the right-click menu of a board card. Settings > Card actions chooses
// which are listed. It opens where the pointer was (or at the row, from the
// keyboard's menu key), and stays mounted while a form it opened (log time,
// note) is still open, then tells the table to let go of it.

export function RowMenu({
  task,
  x,
  y,
  handlers,
  onDone,
}: {
  task: Task;
  x: number;
  y: number;
  handlers: CardHandlers;
  onDone: () => void;
}) {
  const actions = useCardActions(task, handlers);
  const [open, setOpen] = useState(true);
  // Nothing left open: the menu is closed and no form came out of it.
  const idle = !open && !actions.noteOpen && !actions.logging;
  useEffect(() => {
    if (idle) onDone();
  }, [idle, onDone]);

  return (
    <>
      <Dropdown
        // "click" is what makes a click or right-click elsewhere close it; the anchor itself takes no clicks.
        trigger={["click"]}
        autoFocus
        open={open}
        onOpenChange={setOpen}
        rootClassName="jb-menu"
        menu={{
          items: actions.contextMenu.items,
          onClick: (info) => {
            setOpen(false);
            actions.contextMenu.onClick?.(info);
          },
        }}
        popupRender={(menu) => (
          <div className="jb-menu-panel">
            <div className="jb-menu-head" title={titleText(task)}>
              <TaskTitle task={task} />
            </div>
            {menu}
          </div>
        )}
      >
        <span aria-hidden style={{ position: "fixed", left: x, top: y, width: 1, height: 1, pointerEvents: "none" }} />
      </Dropdown>
      {actions.noteOpen && (
        <Modal open title="Edit description" footer={null} width={360} onCancel={() => actions.setNoteOpen(false)} destroyOnHidden>
          <NoteEditor task={task} onSaved={handlers.onChanged} onClose={() => actions.setNoteOpen(false)} />
        </Modal>
      )}
      {actions.logging && (
        <SessionModal
          initial={{ task_id: task.id, area_id: task.area_id }}
          onClose={() => actions.setLogging(false)}
          onSaved={() => actions.reload()}
        />
      )}
    </>
  );
}
