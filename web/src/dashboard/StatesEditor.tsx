import { useState, type ReactNode } from "react";
import { Form, Input, Modal } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { Widget } from "./types";

// Adds or edits a "Buffs and debuffs" widget: the states in force, as chips.
// There is nothing to choose but its title; the states come from the server.

export function StatesEditor({
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
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = { title: title.trim() || "Buffs and debuffs", query: {} };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, source: "states", viz: "states", dashboard_id: dashboardId, x: 0, w: 12, h: 3 });
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
        <Form.Item label="Title" htmlFor="states-title" style={{ marginBottom: 10 }}>
          <Input id="states-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Buffs and debuffs" />
        </Form.Item>
        <div style={{ color: palette.subtle, fontSize: 12 }}>
          Shows the buffs and debuffs in force right now, worst first, as the chips shown along the top of the other screens. Click one to open the Buffs and debuffs screen.
        </div>
      </Form>
    </Modal>
  );
}
