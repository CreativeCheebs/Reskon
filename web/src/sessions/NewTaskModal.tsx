import { useEffect, useRef, useState } from "react";
import { Form, Input, Modal, Select, type InputRef } from "antd";
import { api } from "../api";
import { today } from "../format";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { message } from "../theme/feedback";
import { useTerms } from "../terms";
import type { Task, TaskBrief } from "../types";

/** The short form of a task that the pickers list. */
export function briefOf(t: Task): TaskBrief {
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    type: t.type,
    area_id: t.area_id,
    energy_type_id: t.energy_type_id,
    difficulty: t.difficulty,
    behaviour: t.behaviour,
    parent_id: t.parent_id,
    tag_ids: t.tag_ids ?? [],
  };
}

/**
 * "Create new task" from inside the session form: just a title and an area, the rest can be filled
 * in later on the task itself. It makes the task (in the first to-do status, as everywhere) and
 * hands it back so the form can pick it. Mount it only while it is wanted: it takes its starting
 * title and area once, when it appears. It sits beside the form, not inside it, so Enter here
 * creates the task and does not also save the session.
 */
export function NewTaskModal({
  initialTitle,
  areaId,
  onCreated,
  onClose,
}: {
  initialTitle: string;
  /** The session's area, if it has one yet. */
  areaId: number | null;
  onCreated: (t: TaskBrief) => void;
  onClose: () => void;
}) {
  const { boot, online } = useApp();
  const T = useTerms();
  const [title, setTitle] = useState(initialTitle);
  const [area, setArea] = useState<number | undefined>(areaId ?? boot.areas[0]?.id);
  const [busy, setBusy] = useState(false);
  // Enter can reach create() twice in one go (the box, the form around it) before `busy` has updated.
  const inFlight = useRef(false);
  const titleRef = useRef<InputRef>(null);
  // The picker it was opened from takes the focus back as its list closes, so take it again just after.
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const ready = title.trim() !== "" && area !== undefined && online;
  const create = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const t = await api.post<Task>("/tasks", { title: title.trim(), area_id: area, today: today() });
      onCreated(briefOf(t));
      onClose();
    } catch (e) {
      message.error((e as Error).message);
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`New ${T.task}`}
      okText={`Create ${T.task}`}
      width={420}
      centered
      afterOpenChange={(o) => o && titleRef.current?.focus()}
      onOk={create}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !ready, title: online ? undefined : OFFLINE_TIP }}
    >
      {/* Enter typed here belongs to this box, not to whatever it was opened from. (Escape is left alone: the dialog needs it to close.) */}
      <Form layout="vertical" onFinish={create} onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}>
        <Form.Item label="Title" htmlFor="new-task-title" style={{ marginBottom: 12 }}>
          <Input
            id="new-task-title"
            ref={titleRef}
            value={title}
            maxLength={300}
            disabled={!online}
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={create}
            placeholder="What needs doing?"
          />
        </Form.Item>
        <Form.Item label="Area" htmlFor="new-task-area" style={{ marginBottom: 4 }}>
          <Select
            id="new-task-area"
            value={area}
            onChange={setArea}
            disabled={!online}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
