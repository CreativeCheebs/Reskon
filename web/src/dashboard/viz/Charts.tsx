import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { palette } from "../../theme/palette";
import { formatValue, keyLabel, optionColor, seriesColors } from "../format";
import type { MetricResult, Viz, WidgetOptions } from "../types";

// bar, line, cumulative and split_bar, drawn with Recharts. Values and
// running totals come from the server; this only lays them out.

interface Row {
  key: string;
  name: string;
  long: string;
  [series: string]: string | number;
}

export function Chart({ res, viz, options }: { res: MetricResult; viz: Viz; options: WidgetOptions }) {
  const split = res.series.length > 0;
  const { rows, keys, colors, names } = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const p of res.points) {
      let row = byKey.get(p.key);
      if (!row) {
        row = { key: p.key, name: keyLabel(res, p.key, p.label), long: keyLabel(res, p.key, p.label, true) };
        byKey.set(p.key, row);
      }
      row[split ? `s:${p.split}` : "value"] = p.value;
    }
    const keys = split ? res.series.map((s) => `s:${s.key}`) : ["value"];
    const colors = split ? seriesColors(res.series) : [optionColor(options.color)];
    const names = split ? res.series.map((s) => s.label) : [res.metric];
    return { rows: [...byKey.values()], keys, colors, names };
  }, [res, split, options.color]);

  const axis = options.show_axis !== false;
  const tick = { fill: palette.subtle, fontSize: 11 };
  const common = {
    data: rows,
    margin: { top: 4, right: 8, bottom: 0, left: axis ? -12 : 0 },
  };
  const parts = (
    <>
      <CartesianGrid stroke={palette.border} strokeDasharray="2 4" vertical={false} />
      <XAxis dataKey="name" hide={!axis} tick={tick} tickLine={false} axisLine={{ stroke: palette.border }} minTickGap={12} />
      <YAxis hide={!axis} tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatValue(v, res.unit, res.metric)} />
      <Tooltip
        cursor={{ fill: palette.hover, stroke: palette.borderStrong }}
        contentStyle={{ background: palette.overlay, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
        labelStyle={{ color: palette.fg }}
        itemStyle={{ color: palette.muted }}
        labelFormatter={(_, payload) => (payload?.[0]?.payload as Row | undefined)?.long ?? ""}
        formatter={(v: number, key: string) => [formatValue(v, res.unit, res.metric), split ? names[keys.indexOf(key)] : undefined]}
      />
      {split && <Legend wrapperStyle={{ fontSize: 11, color: palette.muted }} formatter={(key: string) => names[keys.indexOf(key)]} />}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {viz === "line" ? (
        <LineChart {...common}>
          {parts}
          {keys.map((k, i) => (
            <Line key={k} dataKey={k} stroke={colors[i]} strokeWidth={2} dot={rows.length <= 16} isAnimationActive={false} />
          ))}
        </LineChart>
      ) : viz === "cumulative" ? (
        <AreaChart {...common}>
          {parts}
          {keys.map((k, i) => (
            <Area key={k} dataKey={k} stroke={colors[i]} fill={colors[i]} fillOpacity={0.18} strokeWidth={2} stackId={split ? "s" : undefined} isAnimationActive={false} />
          ))}
        </AreaChart>
      ) : (
        <BarChart {...common}>
          {parts}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={colors[i]} stackId={split ? "s" : undefined} maxBarSize={40} radius={split ? 0 : [2, 2, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
