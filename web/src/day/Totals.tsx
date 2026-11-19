import { Tag } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { palette } from "../theme/palette";
import { today } from "../format";
import { minutesText, unestimatedText } from "./plan";
import type { PlanTotals } from "./types";

/**
 * The day's own totals, all from the server (free time included, with no sums
 * here). These are for this day only; a task row shows that task's all-time
 * figures. "today" is only said on today.
 */
export function Totals({ totals, day }: { totals: PlanTotals; day: string }) {
  const unest = unestimatedText(totals.unestimated);
  const when = day === today() ? " today" : "";
  const free = totals.free_min;
  return (
    <div>
      <dl style={{ display: "flex", flexWrap: "wrap", gap: "4px 28px", margin: "8px 0 0" }} aria-label="Totals for this day">
        <div>
          <dt style={labelStyle}>Available</dt>
          {totals.available_min === null || free === null ? (
            <dd style={{ ...valueStyle, color: palette.muted }}>not set</dd>
          ) : free < 0 ? (
            <dd style={{ ...valueStyle, fontSize: 22, color: palette.warn }} role="status">
              {minutesText(-free)} over
            </dd>
          ) : (
            <dd style={{ ...valueStyle, fontSize: 22 }}>
              {minutesText(free)}
            </dd>
          )}
        </div>
        <Stat label={`Planned${when}`} value={minutesText(totals.planned_min)} />
        <Stat label={`Logged${when}`} value={minutesText(totals.logged_min)} />
        {totals.over && (
          <Tag color="warning" icon={<WarningOutlined />} style={{ alignSelf: "center", marginInlineEnd: 0 }}>
            Planned is more than available
          </Tag>
        )}
      </dl>
      {unest && <div style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>{unest}</div>}
    </div>
  );
}

const labelStyle = { color: palette.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 } as const;
const valueStyle = { margin: 0, fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={labelStyle}>{label}</dt>
      <dd style={valueStyle}>{value}</dd>
    </div>
  );
}
