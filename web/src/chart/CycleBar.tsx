import { Tooltip } from "antd";
import { useApp } from "../store";
import { formatAge, formatDateTime } from "../format";
import { palette } from "../theme/palette";
import type { Segment } from "../types";

// One horizontal bar split by status; each segment's width is proportional
// to the hours spent there. `scaleH` sets what 100% width means, so bars
// stacked on one chart share a time axis.

export function CycleBar({
  segments,
  scaleH,
  height = 14,
  colors,
  tip,
}: {
  segments: Segment[];
  scaleH: number;
  height?: number;
  /** Colour per status id; defaults to each status's own colour. */
  colors?: Map<number, string>;
  /** Tooltip for one segment; return null for none (the caller shows its own). */
  tip?: (s: Segment, name: string) => React.ReactNode;
}) {
  const { statusById } = useApp();
  const total = segments.reduce((sum, s) => sum + s.hours, 0);
  const widthPct = scaleH > 0 ? (total / scaleH) * 100 : 0;
  return (
    <div style={{ width: `${Math.max(widthPct, 0.5)}%`, display: "flex", height, borderRadius: 3, overflow: "hidden" }}>
      {segments.map((s, i) => {
        const status = statusById.get(s.status_id);
        const name = status?.name ?? "deleted status";
        const title = tip ? (
          tip(s, name)
        ) : (
          <div style={{ fontSize: 12 }}>
            <b>{name}</b> · {formatAge(s.hours)}
            {s.current && " (now)"}
            <br />
            {formatDateTime(s.from)} → {s.current ? "now" : formatDateTime(s.to)}
          </div>
        );
        return (
          <Tooltip key={i} title={title}>
            <div
              style={{
                // Proportions out of 100: flex-grow values summing below 1
                // would only fill that fraction of the bar.
                flexGrow: total > 0 ? (s.hours / total) * 100 : 1,
                flexBasis: 0,
                minWidth: 2,
                background: colors?.get(s.status_id) ?? status?.color ?? palette.borderStrong,
                borderRight: i < segments.length - 1 ? `1px solid ${palette.bg}` : undefined,
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
