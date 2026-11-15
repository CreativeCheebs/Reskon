import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, Empty, Popconfirm, Spin, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, HolderOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { MIN_WIDTH, type DateOverride, type MetricResult, type Widget } from "./types";
import { VIZZES } from "./viz/registry";
import { AppPageBody } from "./AppPageBody";

// One widget: fetches its metric on mount (and on refresh, never by
// polling) by widget id, then hands the result to its viz. Narrower than
// the viz's minimum width, it shows the number instead of a squashed chart.
// With the dashboard's date picker set, the server runs it over those dates.

/** Fetches path on mount, on reconnect, and when dep changes. */
export function useMetric(path: string | null, dep = "") {
  const { reloadKey } = useApp();
  const [res, setRes] = useState<MetricResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setRes(await api.get<MetricResult>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load, reloadKey, dep]);
  return { res, error, loading, reload: load };
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
  const viz = narrow && !VIZZES[own].keepsWhenNarrow ? "number" : own;
  const entry = VIZZES[viz];
  const empty = res.points.length === 0 && !entry.drawsEmpty;
  const scrolls = !!entry.scrolls;
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, overflow: scrolls || empty ? "auto" : "hidden" }}>
      {empty ? (
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
  const { online } = useApp();
  // The path carries only the widget's id, so a saved change to its query
  // refetches through dep.
  const over = dates ? `&from=${dates.from}&to=${dates.to}` : "";
  // Metric widgets and app pages are built; one of a planned source (made
  // by a newer Reskon on another device) is not run as a metric, and can
  // only be moved or removed here.
  const page = widget.source === "app_page";
  const known = widget.source === undefined || widget.source === "metric";
  const metric = useMetric(known ? `/metrics?widget=${widget.id}${over}` : null, JSON.stringify(widget.query));
  // An app's page reloads, with a fresh sign-in ticket, on Refresh.
  const [pageLoads, setPageLoads] = useState(0);
  const { res } = metric;
  // A page widget's Refresh spins while its page is being launched.
  const [pageLoading, setPageLoading] = useState(false);
  const loading = page ? pageLoading : metric.loading;
  const reload = page ? () => setPageLoads((n) => n + 1) : metric.reload;
  const error = known || page ? metric.error : "This widget needs a newer version of Reskon.";

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
          {widget.title || widget.query.metric || widget.query.widget}
        </span>
        <span className="no-drag" style={{ display: "inline-flex" }}>
          {(known || page) && <Tooltip title="Refresh">
            <Button size="small" type="text" aria-label="Refresh widget" icon={<ReloadOutlined spin={loading} />} onClick={reload} />
          </Tooltip>}
          {editing && onEdit && (known || page) && (
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
      ) : error ? (
        <div role="alert" style={{ color: palette.muted, fontSize: 12, padding: 8, flex: 1, minHeight: 0, overflow: "auto" }}>{error}<br /><Button size="small" onClick={reload} style={{ marginTop: 8 }}>Retry</Button></div>
      ) : res ? (
        <VizBody widget={widget} res={res} />
      ) : (
        <div role="status" aria-label="Loading widget" style={{ display: "grid", placeItems: "center", flex: 1 }}><Spin size="small" /></div>
      )}
    </div>
  );
});
