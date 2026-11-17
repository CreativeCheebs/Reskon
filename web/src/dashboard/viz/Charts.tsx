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
import { formatShare, formatValue, keyLabel, optionColor, resultValue, seriesColors } from "../format";
import type { MetricResult, Viz, WidgetOptions } from "../types";

// bar, line, cumulative, split_bar and share_bar, drawn with Recharts.
// Values, running totals and shares come from the server; this only lays
// them out. A share bar stacks each key's shares to 100%, and its tooltip
// gives the value beside the share.

interface Row {
  key: string;
  name: string;
  long: string;
  [series: string]: string | number;
}

export function Chart({ res, viz, options }: { res: MetricResult; viz: Viz; options: WidgetOptions }) {
  const split = res.series.length > 0;
  const share = viz === "share_bar";
  const { rows, keys, colors, names } = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const p of res.points) {
      let row = byKey.get(p.key);
      if (!row) {
        row = { key: p.key, name: keyLabel(res, p.key, p.label), long: keyLabel(res, p.key, p.label, true) };
        byKey.set(p.key, row);
      }
      const k = split ? `s:${p.split}` : "value";
      row[k] = share ? (p.share ?? 0) * 100 : p.value;
      row[`raw:${k}`] = p.value;
    }
    const keys = split ? res.series.map((s) => `s:${s.key}`) : ["value"];
    const colors = split ? seriesColors(res.series, options.series_colors) : [optionColor(options.color)];
    const names = split ? res.series.map((s) => s.label) : [res.metric];
    return { rows: [...byKey.values()], keys, colors, names };
  }, [res, split, share, options.color, options.series_colors]);

  const axis = options.show_axis !== false;
  const tick = { fill: palette.subtle, fontSize: 11 };
  const common = {
    data: rows,
    margin: { top: 12, right: 12, bottom: 8, left: 0 },
  };
  const parts = (
    <>
      <CartesianGrid stroke={palette.border} strokeDasharray="2 4" vertical={false} />
      <XAxis dataKey="name" hide={!axis} tick={tick} tickLine={false} axisLine={{ stroke: palette.border }} minTickGap={16} tickMargin={8} />
      <YAxis
        hide={!axis}
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={56} tickMargin={8}
        domain={share ? [0, 100] : undefined}
        ticks={share ? [0, 25, 50, 75, 100] : undefined}
        // An app's unit goes in the tooltip, not on every tick.
        tickFormatter={(v: number) => (share ? `${v}%` : res.shape ? String(v) : formatValue(v, res.unit, res.metric))}
      />
      <Tooltip
        cursor={{ fill: palette.hover, stroke: palette.borderStrong }}
        contentStyle={{ background: palette.overlay, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
        labelStyle={{ color: palette.fg }}
        itemStyle={{ color: palette.muted }}
        labelFormatter={(_, payload) => (payload?.[0]?.payload as Row | undefined)?.long ?? ""}
        formatter={(v: number, key: string, item: { payload?: Row }) => {
          const raw = item?.payload?.[`raw:${key}`] as number | undefined;
          const shown = share ? `${formatShare(v / 100)} · ${resultValue(raw ?? 0, res)}` : resultValue(v, res);
          return [shown, split ? names[keys.indexOf(key)] : undefined];
        }}
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
