import { useState, type ReactNode } from "react";
import { Form, Input, Modal, Select } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { RANGE_LABEL } from "./labels";
import type { Widget } from "./types";

// Adds or edits a "Journal" widget: what you did each day, from your session
// notes, for a short range. It saves only the range; every session of each
// day is listed. The dashboard's Day and Dates choice replaces the range.

/** The ranges a journal widget can have (the server's JournalRanges). */
const RANGES = ["today", "yesterday", "7d", "30d", "month"];

export function JournalEditor({
  dashboardId,
  editing,
  onClose,
  onSaved,
  switcher,
  animate = true,
}: {
  dashboardId: number;
  editing?: Widget;
  onClose: () => void;
  onSaved: (w: Widget) => void;
  /** Chooses the kind of widget, for a new widget. */
  switcher?: ReactNode;
  /** False after switching kinds, so the window does not zoom in again. */
  animate?: boolean;
}) {
  const { online } = useApp();
  const [range, setRange] = useState<string>(editing?.query.range ?? "7d");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = { title: title.trim() || "Journal", query: { range } };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, source: "journal", viz: "journal", dashboard_id: dashboardId, x: 0, w: 6, h: 9 });
      onSaved(w);
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
      width={editing ? 520 : 920}
      title={editing ? "Edit widget" : "Add widget"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !online }}
      {...(animate ? {} : { transitionName: "", maskTransitionName: "" })}
    >
      {switcher}
      <Form layout="vertical" size="small" style={{ maxWidth: 480 }}>
        {/* htmlFor and id: Form.Item without a name does not join a label to its control. */}
        <Form.Item label="Title" htmlFor="journal-title" style={{ marginBottom: 10 }}>
          <Input id="journal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Journal" />
        </Form.Item>
        <Form.Item label="Range" htmlFor="journal-range" style={{ marginBottom: 10 }}>
          <Select id="journal-range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] ?? r }))} />
        </Form.Item>
        <div style={{ color: palette.subtle, fontSize: 12 }}>
          Lists each day's sessions, newest day first: when, what, the area, the hours, and the note you wrote on the session, so a day reads like a journal entry. Days with no sessions are left out. Each day has a Copy as Markdown button. Click a session on a task to open the task.
        </div>
      </Form>
    </Modal>
  );
}
