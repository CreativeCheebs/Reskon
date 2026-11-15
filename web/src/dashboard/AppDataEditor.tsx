import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Empty, Form, Input, Modal, Select, Spin } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { AppWidget, ConnectedApp } from "../apps/types";
import type { Viz, Widget } from "./types";
import { useMetric, VizBody } from "./WidgetFrame";
import { AppDataNote } from "./AppDataNote";
import { RANGE_LABEL, VIZ_LABEL } from "./labels";

// Adds or edits an "App data" widget: pick a connected app, one of its data
// widgets, a chart type that suits the data's shape and, where the app's
// feed takes them, a date range and a grouping. The widget saves only names
// (the app's id, its widget's id, the range and group); the server checks
// them against your connected apps and fetches the data. A live preview
// asks the app as you choose.

/** Chart types for each shape, as the server allows them (db.AppDataVizzes).
 *  Stacked bars only when the app's series has parts (splits). */
const SHAPE_VIZZES: Record<NonNullable<AppWidget["shape"]>, Viz[]> = {
  number: ["number"],
  series: ["bar", "line", "cumulative", "number", "split_bar"],
  table: ["table"],
  list: ["list"],
  checklist: ["checklist"],
};

/** Date ranges an app can be asked for: the metrics' ranges, without "All". */
const RANGES = ["today", "7d", "30d", "90d", "1y", "month"];

const GROUP_LABEL: Record<string, string> = { day: "Day", week: "Week", month: "Month" };

const dataOf = (a?: ConnectedApp) => a?.manifest?.widgets.filter((w) => w.kind === "data" && w.shape) ?? [];

export function AppDataEditor({
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
  /** Chooses between kinds of widget, for a new one. */
  switcher?: ReactNode;
  /** False after switching kinds, so the window does not zoom in again. */
  animate?: boolean;
}) {
  const { online } = useApp();
  const [list, setList] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | undefined>(editing?.query.app);
  const [feedId, setFeedId] = useState<string | undefined>(editing?.query.widget);
  const [viz, setViz] = useState<Viz | undefined>(editing?.viz);
  const [range, setRange] = useState<string | undefined>(editing?.query.range);
  const [group, setGroup] = useState<string | undefined>(editing?.query.group);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setLoadError(null);
    api
      .get<ConnectedApp[]>("/apps")
      .then(setList)
      .catch((e) => setLoadError((e as Error).message));
  }, [tries]);

  const withData = (list ?? []).filter((a) => dataOf(a).length > 0);
  const app = withData.find((a) => a.app_id === appId);
  const feeds = dataOf(app);
  const feed = feeds.find((f) => f.id === feedId);

  // Choosing a feed sets its first chart type, its range and its first
  // group; a new title follows the feed until you type your own.
  const pickFeed = (next: AppWidget | undefined) => {
    if (!title.trim() || title === feed?.title) setTitle(next?.title ?? "");
    setFeedId(next?.id);
    setViz(next?.shape ? SHAPE_VIZZES[next.shape][0] : undefined);
    setRange(next?.ranged ? "7d" : undefined);
    setGroup(next?.groups?.[0]);
  };
  const pickApp = (id: string) => {
    const only = dataOf(withData.find((a) => a.app_id === id));
    setAppId(id);
    pickFeed(only.length === 1 ? only[0] : undefined);
  };
  // The first time the list arrives, a lone app is picked for you.
  useEffect(() => {
    if (!editing && !appId && withData.length === 1) pickApp(withData[0].app_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // What the widget saves, e.g. {app: "habits", widget: "last_days", range: "7d", group: "day"}.
  const query: Record<string, string> | null =
    app && feed ? { app: app.app_id, widget: feed.id, ...(feed.ranged && range ? { range } : {}), ...(group && feed.groups?.includes(group) ? { group } : {}) } : null;
  const previewPath = query && viz ? `/apps/data/preview?${new URLSearchParams({ ...query, viz })}` : null;
  const preview = useMetric(previewPath);
  // Only the answer to what is chosen now: never the previous data drawn
  // with the new chart type while the new answer loads.
  const current = !!previewPath && preview.forPath === previewPath;
  const shown = current ? preview.res : null;
  const previewError = current ? preview.error : null;
  // Stacked bars need parts to stack; offered once this data's preview shows
  // some (or kept, if the widget already is one).
  const vizzes = feed?.shape ? SHAPE_VIZZES[feed.shape].filter((v) => v !== "split_bar" || (shown?.series.length ?? 0) > 0 || editing?.viz === v) : [];

  const save = async () => {
    if (!query || !viz || !feed) return;
    setBusy(true);
    try {
      const body = { title: title.trim() || feed.title, viz, query };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, source: "app_data", dashboard_id: dashboardId, x: 0, w: feed.size.w, h: feed.size.h });
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
      width={920}
      title={editing ? "Edit widget" : "Add widget"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !online || !query || !viz }}
      {...noAnimation}
    >
      {switcher}
      {loadError ? (
        <Alert
          type="warning"
          showIcon
          message={loadError}
          action={
            <Button size="small" onClick={() => setTries((n) => n + 1)}>
              Retry
            </Button>
          }
        />
      ) : !list ? (
        <Spin />
      ) : withData.length === 0 && !editing ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            list.length === 0
              ? "No apps are connected. Connect one in Settings › Apps first."
              : "None of your connected apps offers data just now. Check them again in Settings › Apps."
          }
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
          <Form layout="vertical" size="small">
            {/* htmlFor and id: Form.Item without a name does not join a label to its control. */}
            <Form.Item label="App" htmlFor="app-data-app" {...item}>
              <Select id="app-data-app" value={app?.app_id} placeholder="Choose an app" onChange={pickApp} options={withData.map((a) => ({ value: a.app_id, label: a.name }))} />
            </Form.Item>
            <Form.Item label="Data" htmlFor="app-data-feed" {...item}>
              <Select
                id="app-data-feed"
                value={feed?.id}
                placeholder={app ? "Choose what to show" : "Choose an app first"}
                disabled={!app}
                onChange={(id: string) => pickFeed(feeds.find((f) => f.id === id))}
                options={feeds.map((f) => ({ value: f.id, label: f.title }))}
              />
            </Form.Item>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Form.Item label="Show as" htmlFor="app-data-viz" {...item}>
                <Select id="app-data-viz" value={viz} disabled={!feed} onChange={setViz} options={vizzes.map((v) => ({ value: v, label: VIZ_LABEL[v] }))} />
              </Form.Item>
              {feed?.ranged && (
                <Form.Item label="Range" htmlFor="app-data-range" {...item}>
                  <Select id="app-data-range" value={range ?? "7d"} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] ?? r }))} />
                </Form.Item>
              )}
              {(feed?.groups?.length ?? 0) > 1 && (
                <Form.Item label="Group by" htmlFor="app-data-group" {...item}>
                  <Select id="app-data-group" value={group} onChange={setGroup} options={feed!.groups!.map((g) => ({ value: g, label: GROUP_LABEL[g] ?? g }))} />
                </Form.Item>
              )}
            </div>
            <Form.Item label="Title" htmlFor="app-data-title" {...item}>
              <Input id="app-data-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={feed?.title} />
            </Form.Item>
            {editing && editing.query.app && !app && (
              <Alert
                type="warning"
                showIcon
                message={
                  (list ?? []).some((a) => a.app_id === editing.query.app)
                    ? `The app "${editing.query.app}" offers no data just now: check it again in Settings › Apps.`
                    : `The app "${editing.query.app}" is not connected any more.`
                }
                style={{ marginBottom: 10 }}
              />
            )}
            {app && !app.signed_in && (
              <Alert type="warning" showIcon message={`Sign in to ${app.name} again in Settings › Apps, or its data cannot be read.`} style={{ marginBottom: 10 }} />
            )}
            <div style={{ color: palette.subtle, fontSize: 12 }}>
              The data comes from {app?.name ?? "the app"} and is drawn by Reskon. It is read-only and never counts in Reskon's own totals.
            </div>
          </Form>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ color: palette.subtle, fontSize: 12, marginBottom: 6 }}>Preview</div>
            <div
              style={{
                height: 300,
                display: "flex",
                flexDirection: "column",
                background: palette.panel,
                border: `1px solid ${palette.border}`,
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{title || feed?.title}</div>
              {!previewPath ? (
                <div style={{ color: palette.subtle, fontSize: 12 }}>Choose an app and its data to see them here.</div>
              ) : previewError ? (
                <Alert type="warning" showIcon message={previewError} />
              ) : shown && viz ? (
                <>
                  <VizBody widget={{ viz, options: {} }} res={shown} />
                  <AppDataNote res={shown} />
                </>
              ) : (
                <Spin size="small" />
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
