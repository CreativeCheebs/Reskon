import { useState, type ReactNode } from "react";
import { Alert, Empty, Form, Input, Modal, Select } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { Widget } from "./types";

// Adds or edits a "Board" widget: pick a saved view, and the widget shows
// that view's open tasks (to do and in progress) as a small board. It saves
// only the view's id, so the view's own filter is still worked out on the
// server, and changing the view changes the widget.

export function ViewBoardEditor({
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
  /** Chooses between a chart, an app's data, an app's page and a board, for a new widget. */
  switcher?: ReactNode;
  /** False after switching kinds, so the window does not zoom in again. */
  animate?: boolean;
}) {
  const { boot, online } = useApp();
  const views = [...boot.views].sort((a, b) => a.position - b.position);
  const [viewId, setViewId] = useState<number | undefined>(editing?.query.view_id);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);
  const view = views.find((v) => v.id === viewId);

  // The title follows the view picked until you type your own: while it is
  // empty or still the old view's name. A view that is gone has no name to
  // compare with, so the title the widget was saved with stands for it.
  const pick = (id: number) => {
    const next = views.find((v) => v.id === id);
    const auto = view ? view.name : editing?.title;
    if (!title.trim() || title === auto) setTitle(next?.name ?? "");
    setViewId(id);
  };

  const save = async () => {
    if (!view) return;
    setBusy(true);
    try {
      const body = { title: title.trim() || view.name, query: { view_id: view.id } };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, source: "view", viz: "board", dashboard_id: dashboardId, x: 0, w: 8, h: 7 });
      onSaved(w);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const noAnimation = animate ? {} : { transitionName: "", maskTransitionName: "" };
  return (
    <Modal
      open
      width={editing ? 520 : 920}
      title={editing ? "Edit widget" : "Add widget"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !online || !view }}
      {...noAnimation}
    >
      {switcher}
      {views.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="There are no views yet. Make one in the sidebar first." />
      ) : (
        <Form layout="vertical" size="small" style={{ maxWidth: 480 }}>
          {/* htmlFor and id: Form.Item without a name does not join a label to its control. */}
          <Form.Item label="View" htmlFor="board-view" style={{ marginBottom: 10 }}>
            <Select
              id="board-view"
              value={view?.id}
              placeholder="Choose a view"
              onChange={pick}
              options={views.map((v) => ({ value: v.id, label: v.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Title" htmlFor="board-title" style={{ marginBottom: 10 }}>
            <Input id="board-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={view?.name} />
          </Form.Item>
          {editing && !view && (
            <Alert type="warning" showIcon message="The view this widget showed is gone. Pick another." style={{ marginBottom: 10 }} />
          )}
          <div style={{ color: palette.subtle, fontSize: 12 }}>
            Shows the view's tasks that are still open (to do and in progress), as read-only columns. The view's own filter decides which tasks; change it on the view. Click a card to open the task; moving tasks stays on the board.
          </div>
        </Form>
      )}
    </Modal>
  );
}
