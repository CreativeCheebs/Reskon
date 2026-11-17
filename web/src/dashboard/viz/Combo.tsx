import { useMemo } from "react";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { palette } from "../../theme/palette";
import { formatValue, keyLabel, seriesColors } from "../format";
import type { MetricResult, WidgetOptions } from "../types";

// combo: two measures of one metric (points and hours) in one chart: the
// first series as bars on the left axis, the second as a line on the right
// axis. Each has its own scale and its own unit; they are drawn together,
// never added, subtracted or divided. Narrow, each measure falls back to
// its own figure (a single number would have to add them).

interface Row {
  key: string;
  name: string;
  long: string;
  [series: string]: string | number;
}

export function ComboViz({ res, options, narrow }: { res: MetricResult; options: WidgetOptions; narrow: boolean }) {
  const colors = useMemo(() => seriesColors(res.series, options.series_colors), [res.series, options.series_colors]);
  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const p of res.points) {
      let row = byKey.get(p.key);
      if (!row) {
        row = { key: p.key, name: keyLabel(res, p.key, p.label), long: keyLabel(res, p.key, p.label, true) };
        byKey.set(p.key, row);
      }
      row[`s:${p.split}`] = p.value;
    }
    return [...byKey.values()];
  }, [res]);

  const unitOf = (i: number) => res.series[i]?.unit ?? res.unit;
  const show = (v: number, i: number) => formatValue(v, unitOf(i), res.metric);

  if (res.series.length === 0) {
    return <div style={{ color: palette.subtle, fontSize: 12 }}>This chart needs a measure with two series (points and hours).</div>;
  }

  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {res.series.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{show(s.total, i)}</span>
          </div>
        ))}
      </div>
    );
  }

  const axis = options.show_axis !== false;
  const tick = { fill: palette.subtle, fontSize: 11 };
  const [bars, line] = res.series;
  const label = (dataKey: string, i: number, position: "top") =>
    options.show_values ? (
      <LabelList dataKey={dataKey} position={position} fill={palette.muted} fontSize={10} formatter={(v: number) => show(v, i)} />
    ) : null;
  const average = (i: number, yAxisId: string) => {
    const avg = res.series[i]?.average;
    return options.show_average && avg !== undefined ? (
      <ReferenceLine
        key={`avg:${i}`}
        yAxisId={yAxisId}
        y={avg}
        stroke={colors[i]}
        strokeDasharray="5 4"
        strokeWidth={1.5}
        ifOverflow="extendDomain"
        label={{ value: `avg ${show(avg, i)}`, position: i === 0 ? "insideTopLeft" : "insideTopRight", fill: palette.muted, fontSize: 10 }}
      />
    ) : null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: options.show_values ? 22 : 12, right: line ? 0 : 12, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={palette.border} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" hide={!axis} tick={tick} tickLine={false} axisLine={{ stroke: palette.border }} minTickGap={16} tickMargin={8} />
        <YAxis yAxisId="left" hide={!axis} tick={{ ...tick, fill: colors[0] }} tickLine={false} axisLine={false} width={56} tickMargin={8} tickFormatter={(v: number) => show(v, 0)} />
        {line && (
          <YAxis
            yAxisId="right"
            orientation="right"
            hide={!axis}
            tick={{ ...tick, fill: colors[1] }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickMargin={8}
            tickFormatter={(v: number) => show(v, 1)}
          />
        )}
        <Tooltip
          cursor={{ fill: palette.hover, stroke: palette.borderStrong }}
          contentStyle={{ background: palette.overlay, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: palette.fg }}
          itemStyle={{ color: palette.muted }}
          labelFormatter={(_, payload) => (payload?.[0]?.payload as Row | undefined)?.long ?? ""}
          formatter={(v: number, key: string) => {
            const i = res.series.findIndex((s) => `s:${s.key}` === key);
            return [show(v, Math.max(i, 0)), res.series[i]?.label];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: palette.muted }} formatter={(key: string) => res.series.find((s) => `s:${s.key}` === key)?.label ?? key} />
        <Bar yAxisId="left" dataKey={`s:${bars.key}`} fill={colors[0]} maxBarSize={40} radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {label(`s:${bars.key}`, 0, "top")}
        </Bar>
        {line && (
          <Line yAxisId="right" dataKey={`s:${line.key}`} stroke={colors[1]} strokeWidth={2} dot={rows.length <= 16} isAnimationActive={false}>
            {label(`s:${line.key}`, 1, "top")}
          </Line>
        )}
        {average(0, "left")}
        {line && average(1, "right")}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
