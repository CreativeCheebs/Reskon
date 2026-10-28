import { Tooltip } from "antd";
import { useApp } from "../store";
import { formatAge, formatDateTime } from "../format";
import { palette } from "../theme/palette";
import type { Segment } from "../types";

// One horizontal bar split by status; each segment's width is proportional
// to the hours spent there. `scaleH` sets what 100% width means, so bars
// stacked on one chart share a time axis.

export function CycleBar({ segments, scaleH, height = 14 }: { segments: Segment[]; scaleH: number; height?: number }) {
  const { statusById } = useApp();
  const total = segments.reduce((sum, s) => sum + s.hours, 0);
  const widthPct = scaleH > 0 ? (total / scaleH) * 100 : 0;
  return (
    <div style={{ width: `${Math.max(widthPct, 0.5)}%`, display: "flex", height, borderRadius: 3, overflow: "hidden" }}>
      {segments.map((s, i) => {
        const status = statusById.get(s.status_id);
        const name = status?.name ?? "deleted status";
        return (
          <Tooltip
            key={i}
            title={
              <div style={{ fontSize: 12 }}>
                <b>{name}</b> · {formatAge(s.hours)}
                {s.current && " (now)"}
                <br />
                {formatDateTime(s.from)} → {s.current ? "now" : formatDateTime(s.to)}
              </div>
            }
          >
            <div
              style={{
                // Proportions out of 100: flex-grow values summing below 1
                // would only fill that fraction of the bar.
                flexGrow: total > 0 ? (s.hours / total) * 100 : 1,
                flexBasis: 0,
                minWidth: 2,
                background: status?.color ?? palette.borderStrong,
                borderRight: i < segments.length - 1 ? `1px solid ${palette.bg}` : undefined,
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function StatusLegend({ ids }: { ids: number[] }) {
  const { statusById } = useApp();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: palette.muted }}>
      {ids.map((id) => {
        const s = statusById.get(id);
        return (
          <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s?.color ?? palette.borderStrong }} />
            {s?.name ?? "deleted status"}
          </span>
        );
      })}
    </div>
  );
}
