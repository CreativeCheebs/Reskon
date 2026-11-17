import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { palette } from "../../theme/palette";
import { formatValue, keyLabel, seriesColors } from "../format";
import type { MetricResult, WidgetOptions } from "../types";

// small_multiples: one small chart per split value (per energy type, by
// default), in a grid inside one widget. Each chart has its own y-scale
// with its labels shown, so 8 hours of sleep never flattens 1 hour of
// admin; every chart shares the same range and x-axis, so days line up.
// Series are never added together here: each shows its own total, which
// the server reduced. Narrow, each type falls back to its own number.
// With running totals (from the server), each chart is a rising area.

const CELL_MIN = 220; // px; the grid wraps to one column below two of these
const CELL_HEIGHT = 120;

export function SmallMultiplesViz({ res, narrow, options }: { res: MetricResult; narrow: boolean; options?: WidgetOptions }) {
  const chosen = options?.series_colors;
  const colors = useMemo(() => seriesColors(res.series, chosen), [res.series, chosen]);
  const bySeries = useMemo(() => {
    const out = new Map<string, { key: string; name: string; long: string; value: number }[]>();
    for (const s of res.series) out.set(s.key, []);
    for (const p of res.points) {
      out.get(p.split ?? "")?.push({ key: p.key, name: keyLabel(res, p.key, p.label), long: keyLabel(res, p.key, p.label, true), value: p.value });
    }
    return out;
  }, [res]);

  if (res.series.length === 0) {
    return <div style={{ color: palette.subtle, fontSize: 12 }}>Small multiples need a split (by energy type, area or subtype).</div>;
  }

  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {res.series.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatValue(s.total, res.unit, res.metric)}</span>
          </div>
        ))}
      </div>
    );
  }

  const tick = { fill: palette.subtle, fontSize: 10 };
  const Chart = res.cumulative ? AreaChart : BarChart;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_MIN}px, 1fr))`, gap: "10px 14px" }}>
      {res.series.map((s, i) => (
        <div key={s.key} style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flex: "none", alignSelf: "center" }} />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label}
            </span>
            <span style={{ color: palette.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              {res.reduce === "sum" ? "total " : ""}
              {formatValue(s.total, res.unit, res.metric)}
            </span>
          </div>
          <div style={{ height: CELL_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <Chart data={bySeries.get(s.key)} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={{ stroke: palette.border }} minTickGap={16} />
                <YAxis
                  tick={tick}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickCount={3}
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  tickFormatter={(v: number) => formatValue(v, res.unit, res.metric)}
                />
                <Tooltip
                  cursor={res.cumulative ? { stroke: palette.borderStrong } : { fill: palette.hover }}
                  contentStyle={{ background: palette.overlay, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: palette.fg }}
                  itemStyle={{ color: palette.muted }}
                  labelFormatter={(_, payload) => (payload?.[0]?.payload as { long?: string } | undefined)?.long ?? ""}
                  formatter={(v: number) => [formatValue(v, res.unit, res.metric), s.label]}
                />
                {res.cumulative ? (
                  <Area dataKey="value" stroke={colors[i]} fill={colors[i]} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
                ) : (
                  <Bar dataKey="value" fill={colors[i]} maxBarSize={24} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                )}
              </Chart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
