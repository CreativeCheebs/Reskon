import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../../store";
import { palette } from "../../theme/palette";
import { formatValue, formatShare, seriesColors } from "../format";
import type { MetricResult } from "../types";

// pie: each group value's part of the whole (by energy type, by default),
// with its share and its own value beside it. Shares come from the server;
// the slices only draw them. Energy types and areas keep their colours.

export function PieViz({ res }: { res: MetricResult }) {
  const { boot } = useApp();
  const slices = useMemo(() => {
    const own = res.group === "energy_type" ? boot.energy_types : res.group === "area" ? boot.areas : [];
    const withColor = res.points.map((p) => ({ ...p, color: own.find((x) => String(x.id) === p.key)?.color ?? null }));
    const colors = seriesColors(withColor);
    return withColor.map((p, i) => ({ ...p, fill: colors[i] })).filter((p) => p.value > 0);
  }, [res, boot.energy_types, boot.areas]);

  if (slices.length === 0) return <div style={{ color: palette.subtle, fontSize: 12 }}>Nothing in this range</div>;
  return (
    <div style={{ height: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px" }}>
      <div style={{ flex: "1 1 140px", height: "100%", minHeight: 140, minWidth: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="52%" outerRadius="92%" paddingAngle={1} stroke={palette.panel} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: palette.overlay, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
              itemStyle={{ color: palette.muted }}
              formatter={(v: number, name: string, item) => [
                `${formatShare((item?.payload as { share?: number } | undefined)?.share)} · ${formatValue(v, res.unit, res.metric)}`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.fill, flex: "none", alignSelf: "center" }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatShare(s.share)}</span>
            <span style={{ color: palette.muted, fontVariantNumeric: "tabular-nums", minWidth: 38, textAlign: "right" }}>
              {formatValue(s.value, res.unit, res.metric)}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${palette.border}`, paddingTop: 3, marginTop: 1, color: palette.muted }}>
          <span style={{ flex: 1 }}>Total</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatValue(res.total, res.unit, res.metric)}</span>
        </div>
      </div>
    </div>
  );
}
