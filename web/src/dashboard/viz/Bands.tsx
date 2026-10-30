import { Tooltip } from "antd";
import { palette } from "../../theme/palette";
import type { MetricResult, StateSpan } from "../types";

// Buffs and debuffs across days: each state is one continuous span over the
// days it was in force, in its own lane. Plain divs, not a chart. It sits
// above a points widget to explain it; it never shades or scales it.

const KIND_COLOR = (kind: StateSpan["kind"]) => ({ debuff: palette.epic, buff: palette.success, modifier: palette.accent })[kind];

function dayIndex(from: string, day: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function BandsViz({ res }: { res: MetricResult }) {
  const spans = res.spans ?? [];
  const days = dayIndex(res.from, res.to) + 1;
  if (spans.length === 0) return <div style={{ color: palette.subtle, fontSize: 12 }}>Nothing in force in this range.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {spans.map((s) => {
        const left = (dayIndex(res.from, s.from) / days) * 100;
        const width = ((dayIndex(s.from, s.to) + 1) / days) * 100;
        const color = KIND_COLOR(s.kind);
        const sev = s.effective_severity === s.severity ? `${s.severity}` : `${round(s.effective_severity)} (from ${s.severity})`;
        return (
          <div key={s.state_id} style={{ position: "relative", height: 20 }}>
            <Tooltip title={`${s.name} · ${s.kind} · ${s.from} to ${s.to}${s.cleared ? "" : " (still in force)"} · severity ${sev}`}>
              <div
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${width}%`,
                  top: 0,
                  bottom: 0,
                  background: `${color}33`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 3,
                  padding: "0 6px",
                  fontSize: 12,
                  lineHeight: "20px",
                  color: palette.fg,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.name}
              </div>
            </Tooltip>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", color: palette.subtle, fontSize: 11 }}>
        <span>{res.from}</span>
        <span>{res.to}</span>
      </div>
    </div>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;
