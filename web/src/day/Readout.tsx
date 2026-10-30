import type { ReactNode } from "react";
import { Segmented, Tooltip } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { formatHours } from "../format";
import { Heading, Panel } from "./Panel";
import { InForce } from "./PlanPanel";
import type { DayData, Feedback } from "./types";

// Evening: per spend energy type, the planned ceiling and what was spent.
// Rest sits alongside, by kind, and is never set against work. The marker
// shows only when spend passed your own plan: an indicator, not an
// instruction. Then one question about the ceiling, answerable any time.

const FEEDBACK: { value: Feedback; label: string }[] = [
  { value: "too_low", label: "Too low" },
  { value: "about_right", label: "About right" },
  { value: "too_high", label: "Too high" },
];

export function Readout({ data, onSave }: { data: DayData; onSave: (patch: Record<string, unknown>) => void }) {
  const { online } = useApp();
  return (
    <Panel title="Evening · readout">
      <Heading>Spend</Heading>
      {data.readout.length === 0 ? (
        <div style={{ color: palette.subtle, fontSize: 12 }}>No spend logged and no ceilings set.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 14px", alignItems: "center" }}>
          {data.readout.map((r) => (
            <Row key={r.energy_type_id} name={r.name}>
              <span style={{ color: palette.muted }}>{r.planned === null ? "no ceiling" : `planned ${formatHours(r.planned)}`}</span>
              <span>spent {formatHours(r.spent)}</span>
              <span style={{ width: 16 }}>
                {r.over && (
                  <Tooltip title="Over the ceiling you set for today">
                    <WarningOutlined style={{ color: palette.warn }} aria-label="over your plan" />
                  </Tooltip>
                )}
              </span>
            </Row>
          ))}
        </div>
      )}

      <Heading>Restore</Heading>
      {data.restore.length === 0 ? (
        <div style={{ color: palette.subtle, fontSize: 12 }}>No rest logged.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 14px" }}>
          {data.restore.map((r) => (
            <Row key={r.energy_type_id} name={r.name}>
              <span>{formatHours(r.hours)}</span>
            </Row>
          ))}
        </div>
      )}

      <Heading>In force</Heading>
      <InForce data={data} />

      <Heading>Was today's ceiling about right?</Heading>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Segmented
          disabled={!online}
          value={data.plan.ceiling_feedback ?? ""}
          onChange={(v) => onSave({ ceiling_feedback: v || null })}
          options={[...FEEDBACK, { value: "", label: "Not answered" }]}
        />
      </div>
      <div style={{ color: palette.subtle, fontSize: 12, marginTop: 6 }}>
        "Too high" suggests about 20% less for the next three days, then eases back. It can be changed later.
      </div>
    </Panel>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <span>{name}</span>
      {children}
    </>
  );
}
