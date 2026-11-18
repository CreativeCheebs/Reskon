import { Tag } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { palette } from "../theme/palette";
import { availableText, minutesText, unestimatedText } from "./plan";
import type { PlanTotals } from "./types";

/**
 * The day's own totals, all from the server. These are for this day only; a
 * task row shows that task's all-time figures and says so.
 */
export function Totals({ totals }: { totals: PlanTotals }) {
  const unest = unestimatedText(totals.unestimated);
  return (
    <div>
      <dl style={{ display: "flex", flexWrap: "wrap", gap: "4px 24px", margin: "8px 0 0" }} aria-label="Totals for this day">
        <Stat label="Planned today" value={minutesText(totals.planned_min)} />
        <Stat label="Logged today" value={minutesText(totals.logged_min)} />
        <Stat label="Available" value={totals.available_min === null ? "not set" : minutesText(totals.available_min)} />
        {totals.over && (
          <Tag color="warning" icon={<WarningOutlined />} style={{ alignSelf: "center", marginInlineEnd: 0 }} role="status">
            Planned is more than available
          </Tag>
        )}
      </dl>
      <div style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>
        {availableText(totals)}
        {unest && ` · ${unest}`}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: palette.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}
