import { useEffect, useState, type ReactNode } from "react";
import { Alert, Empty, Form, Input, Modal, Select, Spin } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { ConnectedApp } from "../apps/types";
import type { Widget } from "./types";

// Adds or edits an "App page" widget: pick a connected app, then one of the
// pages it offers. The widget saves only the app's id and the page's id;
// the server checks both against your connected apps.

export function AppPageEditor({
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
  /** Chooses between a chart and an app page, for a new widget. */
  switcher?: ReactNode;
  /** False after switching kinds, so the window does not zoom in again. */
  animate?: boolean;
}) {
  const { online } = useApp();
  const [list, setList] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | undefined>(editing?.query.app);
  const [pageId, setPageId] = useState<string | undefined>(editing?.query.widget);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<ConnectedApp[]>("/apps")
      .then(setList)
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  const pagesOf = (a?: ConnectedApp) => a?.manifest?.widgets.filter((w) => w.kind === "page") ?? [];
  const withPages = (list ?? []).filter((a) => pagesOf(a).length > 0);
  const app = withPages.find((a) => a.app_id === appId);
  const pages = pagesOf(app);
  const page = pages.find((p) => p.id === pageId);

  // A new title follows the page picked, until you type your own.
  const pickPage = (id: string | undefined) => {
    const next = pages.find((p) => p.id === id);
    if (!title.trim() || title === page?.title) setTitle(next?.title ?? "");
    setPageId(id);
  };
  const pickApp = (id: string) => {
    const only = pagesOf(withPages.find((a) => a.app_id === id));
    setAppId(id);
    const next = only.length === 1 ? only[0] : undefined;
    if (!title.trim() || title === page?.title) setTitle(next?.title ?? "");
    setPageId(next?.id);
  };
  // The first time the list arrives, a lone app is picked for you.
  useEffect(() => {
    if (!editing && !appId && withPages.length === 1) pickApp(withPages[0].app_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const save = async () => {
    if (!app || !page) return;
    setBusy(true);
    try {
      const body = { title: title.trim() || page.title, query: { app: app.app_id, widget: page.id } };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, source: "app_page", dashboard_id: dashboardId, x: 0, w: page.size.w, h: page.size.h });
      onSaved(w);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const noAnimation = animate ? {} : { transitionName: "", maskTransitionName: "" };
  const item = { style: { marginBottom: 10 } };
  return (
    <Modal
      open
      width={editing ? 520 : 920}
      title={editing ? "Edit widget" : "Add widget"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !online || !app || !page }}
      {...noAnimation}
    >
      {switcher}
      {loadError ? (
        <Alert type="warning" showIcon message={loadError} />
      ) : !list ? (
        <Spin />
      ) : withPages.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            list.length === 0
              ? "No apps are connected. Connect one in Settings › Apps first."
              : "None of your connected apps offers a page just now. Check them again in Settings › Apps."
          }
        />
      ) : (
        <Form layout="vertical" size="small" style={{ maxWidth: 480 }}>
          {/* htmlFor and id: Form.Item without a name does not join a label to its control. */}
          <Form.Item label="App" htmlFor="app-page-app" {...item}>
            <Select
              id="app-page-app"
              value={app?.app_id}
              placeholder="Choose an app"
              onChange={pickApp}
              options={withPages.map((a) => ({ value: a.app_id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item
            label="Page"
            htmlFor="app-page-page"
            {...item}
            extra={page ? (page.style === "own" ? "Shown in the app's own look." : "Shown in Reskon's colours.") : undefined}
          >
            <Select
              id="app-page-page"
              value={page?.id}
              placeholder={app ? "Choose a page" : "Choose an app first"}
              disabled={!app}
              onChange={pickPage}
              options={pages.map((p) => ({ value: p.id, label: p.title }))}
            />
          </Form.Item>
          <Form.Item label="Title" htmlFor="app-page-title" {...item}>
            <Input id="app-page-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={page?.title} />
          </Form.Item>
          {editing && editing.query.app && !app && (
            <Alert
              type="warning"
              showIcon
              message={
                (list ?? []).some((a) => a.app_id === editing.query.app)
                  ? `The app "${editing.query.app}" offers no pages just now: check it again in Settings › Apps.`
                  : `The app "${editing.query.app}" is not connected any more.`
              }
              style={{ marginBottom: 10 }}
            />
          )}
          {app && !app.signed_in && (
            <Alert type="warning" showIcon message={`Sign in to ${app.name} again in Settings › Apps, or its page cannot open.`} style={{ marginBottom: 10 }} />
          )}
          <div style={{ color: palette.subtle, fontSize: 12 }}>
            The page comes from {app?.name ?? "the app"} itself and opens already signed in. Ticks and edits in it are saved by the app, not by Reskon.
          </div>
        </Form>
      )}
    </Modal>
  );
}
