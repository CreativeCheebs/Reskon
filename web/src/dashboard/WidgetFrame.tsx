import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, Empty, Popconfirm, Spin, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, HolderOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { MIN_WIDTH, type DateOverride, type MetricResult, type Widget } from "./types";
import { Chart } from "./viz/Charts";
import { ListViz, NumberViz, TableViz } from "./viz/Simple";
import { BandsViz } from "./viz/Bands";
import { SmallMultiplesViz } from "./viz/SmallMultiples";
import { PieViz } from "./viz/Pie";

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
  // Small multiples fall back per type, never to one summed number.
  const viz = narrow && widget.viz !== "small_multiples" ? "number" : widget.viz;
  const empty = res.points.length === 0 && viz !== "number" && viz !== "bands";
  const scrolls = viz === "list" || viz === "table" || viz === "small_multiples" || viz === "pie";
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, overflow: scrolls ? "auto" : "hidden" }}>
      {empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in this range" style={{ margin: "8px 0" }} />
      ) : viz === "pie" ? (
        <PieViz res={res} />
      ) : viz === "small_multiples" ? (
        <SmallMultiplesViz res={res} narrow={narrow} />
      ) : viz === "number" ? (
        <NumberViz res={res} />
      ) : viz === "list" ? (
        <ListViz res={res} />
      ) : viz === "table" ? (
        <TableViz res={res} />
      ) : viz === "bands" ? (
        <BandsViz res={res} />
      ) : (
        <Chart res={res} viz={viz} options={widget.options} />
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
  const { res, error, loading, reload } = useMetric(`/metrics?widget=${widget.id}${over}`, JSON.stringify(widget.query));

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: palette.panel,
        border: `1px solid ${editing ? palette.borderStrong : palette.border}`,
        borderRadius: 10,
        padding: "12px 14px 14px",
        fontSize: 13,
        cursor: editing ? "grab" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, minHeight: 22 }}>
        {editing && <HolderOutlined style={{ color: palette.subtle }} />}
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {widget.title || widget.query.metric}
        </span>
        <span className="no-drag" style={{ display: "inline-flex" }}>
          <Tooltip title="Refresh">
            <Button size="small" type="text" icon={<ReloadOutlined spin={loading} />} onClick={reload} />
          </Tooltip>
          {editing && onEdit && (
            <Tooltip title="Edit widget">
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(widget)} disabled={!online} />
            </Tooltip>
          )}
          {editing && onDelete && (
            <Popconfirm title="Remove this widget?" onConfirm={() => onDelete(widget)} okText="Remove">
              <Button size="small" type="text" icon={<DeleteOutlined />} disabled={!online} />
            </Popconfirm>
          )}
        </span>
      </div>
      {error ? (
        <div style={{ color: palette.muted, fontSize: 12 }}>{error}</div>
      ) : res ? (
        <VizBody widget={widget} res={res} />
      ) : (
        <Spin size="small" />
      )}
    </div>
  );
});
