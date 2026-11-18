import { palette } from "../theme/palette";
import { SeverityIcon, severityBand } from "../states/severity";
import { severityText, type DayData } from "./types";

/** The buffs and debuffs in force on the day: shown, never entered here. */
export function InForce({ data }: { data: DayData }) {
  if (data.in_force.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12 }} aria-label="In force">
      {data.in_force.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SeverityIcon kind={s.kind} severity={s.effective_severity} />
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          <span style={{ color: palette.muted }}>
            {s.kind} · {severityText(s)} {severityBand(s.effective_severity, s.kind).name.toLowerCase()} · day {s.days_running}
            {s.ended ? " · ended, not cleared" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
