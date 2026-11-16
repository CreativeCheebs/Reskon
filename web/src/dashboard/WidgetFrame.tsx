import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, Empty, Popconfirm, Spin, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, ExportOutlined, HolderOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { MIN_WIDTH, type DateOverride, type MetricResult, type Widget } from "./types";
import { VIZZES } from "./viz/registry";
import { AppPageBody } from "./AppPageBody";
import { AppDataNote } from "./AppDataNote";
import { ViewBoardBody } from "./ViewBoardBody";
import type { Task } from "../types";
import { onAppChanged } from "../apps/appChanged";

// One widget: fetches its metric (or its app's data, or its view's tasks) on mount, on Refresh
// and on live updates, never by polling, by widget id, then hands the
// result to its viz. Narrower than
// the viz's minimum width, it shows the number instead of a squashed chart.
// With the dashboard's date picker set, the server runs it over those dates.

/** Fetches path on mount, on reconnect, and when dep changes. The last
 *  result stays on screen while the next loads, so a reload never blanks
 *  the chart. Only the newest request counts: a newer one calls the older
 *  off (so a slow app is not kept waiting on), and a late answer cannot
 *  replace a newer one. forPath and forDep say which path and dep the
 *  result (or error) shown belongs to, so a caller can tell an old answer
 *  from the one it asked for. Refresh does nothing while a load runs.
 *  refetch is for data known to have changed: with a load running, that
 *  load's answer (asked before the change) is not shown and exactly one
 *  more load follows it, so a stream of changes never cancels loads
 *  forever, and what is shown is never from before the latest change. */
export function useMetric<T = MetricResult>(path: string | null, dep = "") {
  const { reloadKey } = useApp();
  const [res, setRes] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState<{ path: string; dep: string } | null>(null);
  // The path the result shown was fetched for (a failed fetch keeps the old one).
  const [resPath, setResPath] = useState<string | null>(null);
  const seq = useRef(0);
  const running = useRef<AbortController | null>(null);
  const depNow = useRef(dep);
  depNow.current = dep;
  // The data changed while the running load was on its way.
  const stale = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const load = useCallback(async () => {
    if (!path) return;
    running.current?.abort();
    stale.current = false;
    const ctrl = new AbortController();
    running.current = ctrl;
    const n = ++seq.current;
    const forDep = depNow.current;
    setLoading(true);
    let next: T | null = null;
    let failed: string | null = null;
    try {
      next = await api.get<T>(path, { signal: ctrl.signal });
    } catch (e) {
      failed = (e as Error).message;
    }
    if (n !== seq.current) return;
    if (stale.current) {
      // Asked before the latest change: ask once more, show nothing of this.
      void loadRef.current();
      return;
    }
    if (failed !== null) setError(failed);
    else {
      setRes(next);
      setResPath(path);
      setError(null);
    }
    setOwner({ path, dep: forDep });
    setLoading(false);
    running.current = null;
  }, [path]);
  loadRef.current = load;
  useEffect(() => {
    load();
  }, [load, reloadKey, dep]);
  // Gone from the screen: the answer is no longer wanted.
  useEffect(() => () => running.current?.abort(), []);
  const reload = useCallback(() => {
    if (!running.current) load();
  }, [load]);
  const refetch = useCallback(() => {
    if (running.current) stale.current = true;
    else void load();
  }, [load]);
  return { res, resPath, error, loading, reload, refetch, forPath: owner?.path ?? null, forDep: owner?.dep ?? null };
}

/** Width of an element, kept up to date. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function VizBody({ widget, res }: { widget: Pick<Widget, "viz" | "options">; res: MetricResult }) {
  const { ref, width } = useWidth();
  const min = widget.options.min_width_px ?? MIN_WIDTH[widget.viz];
  const narrow = width > 0 && width < min;
  // A chart type this version does not know (from a newer Reskon) draws as bars.
  const own = VIZZES[widget.viz] ? widget.viz : "bar";
  // An app's table has no single figure to fall back to: it scrolls sideways instead.
  const keeps = VIZZES[own].keepsWhenNarrow || (own === "table" && !!res.table);
  const viz = narrow && !keeps ? "number" : own;
  const entry = VIZZES[viz];
  // An app's table has rows, not points.
  const empty = (res.table ? res.table.rows.length === 0 : res.points.length === 0) && !entry.drawsEmpty;
  const scrolls = !!entry.scrolls;
  // An app's list, checklist or table can be taller or wider than the
  // widget: it takes the keyboard's focus so the arrow keys can scroll it.
  const focusable = scrolls && !!res.shape && !empty ? { tabIndex: 0, role: "region", "aria-label": res.label || res.app_name || "App data" } : {};
  return (
    <div ref={ref} {...focusable} style={{ flex: 1, minHeight: 0, overflow: scrolls || empty ? "auto" : "hidden" }}>
      {empty && res.shape ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>{res.app_name || "The app"} sent nothing to show<br /><small>{res.from ? "Try another date range." : "It may have nothing yet."}</small></span>} style={{ margin: "auto", padding: "24px 12px" }} />
      ) : empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>No data in this range<br /><small>Try another date range to see your records.</small></span>} style={{ margin: "auto", padding: "24px 12px" }} />
      ) : (
        entry.draw({ res, options: widget.options, narrow })
      )}
    </div>
  );
}

export const WidgetFrame = memo(function WidgetFrame({
  widget,
  editing,
  dates,
  onEdit,
  onDelete,
}: {
  widget: Widget;
  editing: boolean;
  dates?: DateOverride | null;
  onEdit?: (w: Widget) => void;
  onDelete?: (w: Widget) => void;
}) {
  const { online, boot } = useApp();
  // The path carries only the widget's id, so a saved change to its query
  // refetches through dep.
  // Metric widgets, app data and app pages are built; one of a planned
  // source (made by a newer Reskon on another device) is not run as a
  // metric, and can only be moved or removed here. App data is drawn like a
  // metric, from the app (or Reskon's kept copy of its last answer).
  const page = widget.source === "app_page";
  const board = widget.source === "view";
  const appData = widget.source === "app_data";
  const known = widget.source === undefined || widget.source === "metric" || appData;
  // App data with no range of its own ignores the dashboard's dates, so
  // changing them does not ask its app again.
  const over = dates && (!appData || widget.query.range) ? `&from=${dates.from}&to=${dates.to}` : "";
  const path = appData ? `/apps/data?widget=${widget.id}${over}` : `/metrics?widget=${widget.id}${over}`;
  const dep = JSON.stringify(widget.query) + widget.viz;
  const metric = useMetric(known ? path : null, dep);
  // A board widget asks for its view's tasks the way the board does: the
  // widget sends the view's id, never a filter. A view that is gone is not asked for.
  const viewId = board ? Number(widget.query.view_id) : 0;
  const view = board ? boot.views.find((v) => v.id === viewId) : undefined;
  const tasksPath = view ? `/tasks?view=${view.id}` : null;
  const tasks = useMetric<Task[]>(tasksPath, dep);
  // The app said its data changed (its page beside this widget, or its own
  // server): fetch again. The chart stays on screen while it loads.
  const appId = appData ? String(widget.query.app ?? "") : "";
  const { refetch } = metric;
  useEffect(() => (appId ? onAppChanged(appId, refetch) : undefined), [appId, refetch]);
  // An app's page reloads, with a fresh sign-in ticket, on Refresh.
  const [pageLoads, setPageLoads] = useState(0);
  // After an edit that changed an app widget's data or chart type, the old
  // answer is not drawn the new way: the widget shows it is loading instead.
  const res = appData && metric.forDep !== dep ? null : metric.res;
  // A page widget's Refresh spins while its page is being launched.
  const [pageLoading, setPageLoading] = useState(false);
  const loading = page ? pageLoading : board ? tasks.loading : metric.loading;
  const reload = page ? () => setPageLoads((n) => n + 1) : board ? tasks.reload : metric.reload;
  const error = board
    ? view
      ? tasks.error
      : "This view is not available any more. Edit the widget to pick another."
    : !known && !page
      ? "This widget needs a newer version of Reskon."
      : appData && metric.forDep !== dep
        ? null
        : metric.error;
  // After the widget is pointed at another view, the old view's cards are not
  // drawn under it. Cards already shown stay when a later reload fails: the
  // failure is a small note under them, not a replacement for them.
  const boardTasks = board && tasks.resPath === tasksPath ? tasks.res : null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: palette.panel,
        border: `1px solid ${editing ? palette.borderStrong : palette.border}`,
        borderRadius: 10,
        padding: widget.h <= 2 ? "4px 10px" : "12px 14px 14px",
        fontSize: 13,
        cursor: editing ? "grab" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: widget.h <= 2 ? 2 : 14, paddingBottom: widget.h <= 2 ? 0 : 10, borderBottom: `1px solid ${palette.border}`, minHeight: 32 }}>
        {editing && <HolderOutlined style={{ color: palette.subtle }} />}
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {widget.title || view?.name || widget.query.metric || widget.query.widget}
        </span>
        <span className="no-drag" style={{ display: "inline-flex" }}>
          {board && view && (
            <Tooltip title="Open view">
              {/* An icon, so the title keeps its room in a narrow widget. */}
              <Button
                size="small"
                type="text"
                href={editing ? undefined : `#/view/${view.id}`}
                disabled={editing}
                aria-label={`Open view ${view.name}`}
                icon={<ExportOutlined />}
                style={{ color: palette.muted }}
              />
            </Tooltip>
          )}
          {(known || page || (board && view)) && <Tooltip title="Refresh">
            <Button size="small" type="text" aria-label="Refresh widget" icon={<ReloadOutlined spin={loading} />} onClick={reload} />
          </Tooltip>}
          {editing && onEdit && (known || page || board) && (
            <Tooltip title="Edit widget">
              <Button size="small" type="text" aria-label="Edit widget" icon={<EditOutlined />} onClick={() => onEdit(widget)} disabled={!online} />
            </Tooltip>
          )}
          {editing && onDelete && (
            <Popconfirm title="Remove this widget?" onConfirm={() => onDelete(widget)} okText="Remove">
              <Button size="small" type="text" aria-label="Remove widget" icon={<DeleteOutlined />} disabled={!online} />
            </Popconfirm>
          )}
        </span>
      </div>
      {page ? (
        <AppPageBody widget={widget} loads={pageLoads} editing={editing} onLoading={setPageLoading} />
      ) : error && !(board && boardTasks) ? (
        <div role="alert" style={{ color: palette.muted, fontSize: 12, padding: 8, flex: 1, minHeight: 0, overflow: "auto" }}>{error}{!(board && !view) && <><br /><Button size="small" onClick={reload} style={{ marginTop: 8 }}>Retry</Button></>}</div>
      ) : board ? (
        boardTasks && view ? (
          <>
            <ViewBoardBody view={view} tasks={boardTasks} editing={editing} refetch={tasks.refetch} />
            {error && (
              <div role="alert" style={{ color: palette.muted, fontSize: 12, paddingTop: 6 }}>
                Could not refresh: {error} <Button size="small" type="link" onClick={reload}>Retry</Button>
              </div>
            )}
          </>
        ) : (
          <div role="status" aria-label="Loading widget" style={{ display: "grid", placeItems: "center", flex: 1 }}><Spin size="small" /></div>
        )
      ) : res ? (
        <>
          <VizBody widget={widget} res={res} />
          {appData && <AppDataNote res={res} />}
        </>
      ) : (
        <div role="status" aria-label="Loading widget" style={{ display: "grid", placeItems: "center", flex: 1 }}><Spin size="small" /></div>
      )}
    </div>
  );
});
