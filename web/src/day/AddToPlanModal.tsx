import { useState } from "react";
import { Form, Input, Modal, Segmented, Select } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { today } from "../format";
import { useTerms } from "../terms";
import { parseMinutes } from "./plan";
import type { Task } from "../types";

/**
 * "Add to plan": make a new task (with its one whole-task estimate) or a new
 * event (with the minutes it reserves) and put it on the day. Mount it only
 * while it is open.
 */
export function AddToPlanModal({ day, onDone, onClose }: { day: string; onDone: () => void; onClose: () => void }) {
  const { boot, online } = useApp();
  const T = useTerms();
  const [kind, setKind] = useState<"task" | "event">("task");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<number | undefined>(boot.areas[0]?.id);
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mins = parseMinutes(minutes);
  const minutesOk = minutes.trim() === "" ? kind === "task" : mins !== null && mins <= 1440;
  const ready = online && title.trim() !== "" && minutesOk && (kind === "event" || area !== undefined);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "task") {
        const t = await api.post<Task>("/tasks", { title: title.trim(), area_id: area, ...(mins ? { estimate_h: mins / 60 } : {}), today: today() });
        await api.post(`/day/${day}/items`, { task_id: t.id });
      } else {
        await api.post(`/day/${day}/items`, { title: title.trim(), planned_min: mins, ...(area ? { area_id: area } : {}) });
      }
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      centered
      width={440}
      title="Add to plan"
      okText="Add to plan"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !ready, title: online ? undefined : OFFLINE_TIP }}
    >
      <Form layout="vertical" onFinish={save}>
        <Segmented
          block
          value={kind}
          onChange={(v) => setKind(v as "task" | "event")}
          options={[
            { value: "task", label: `New ${T.task}` },
            { value: "event", label: "New event" },
          ]}
          style={{ marginBottom: 12 }}
        />
        <Form.Item label={kind === "task" ? `${T.Task} name` : "Event name"} htmlFor="plan-add-title" style={{ marginBottom: 12 }}>
          <Input id="plan-add-title" autoFocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} onPressEnter={save} placeholder={kind === "task" ? "What do you want to work on?" : "e.g. Team meeting"} />
        </Form.Item>
        <Form.Item label={kind === "task" ? "Area" : "Area (optional)"} htmlFor="plan-add-area" style={{ marginBottom: 12 }}>
          <Select
            id="plan-add-area"
            value={area}
            allowClear={kind === "event"}
            onChange={(v) => setArea(v)}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Form.Item>
        <Form.Item
          label={kind === "task" ? "Whole-task estimate (optional)" : "Planned duration"}
          htmlFor="plan-add-minutes"
          extra={kind === "task" ? "The estimate is for the whole task, not just this day. Minutes, or like 1h 30m." : "The time this event reserves on the day. Minutes, or like 1h 30m."}
          validateStatus={minutes.trim() !== "" && !minutesOk ? "error" : undefined}
          help={minutes.trim() !== "" && !minutesOk ? "Enter minutes, like 45 or 1h 30m (up to 24h)." : undefined}
          style={{ marginBottom: 4 }}
        >
          <Input id="plan-add-minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} onPressEnter={save} placeholder="e.g. 90" />
        </Form.Item>
        {error && <div role="alert" style={{ color: "var(--ant-color-error)", fontSize: 12 }}>{error}</div>}
      </Form>
    </Modal>
  );
}
