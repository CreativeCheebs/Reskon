import { Button, Tag, Tooltip } from "antd";
import { CloseOutlined, MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { palette } from "../theme/palette";
import { formatHours } from "../format";
import { Heading, Panel } from "./Panel";
import { severityText, type DayData } from "./types";

// Morning: focus, ceilings, and what is in force. Everything is optional
// and carried forward from the last plan, so most mornings are one tap
// ("Keep this plan") or none. States are shown, never entered here.

const STEP = 0.5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export function PlanPanel({ data, onSave }: { data: DayData; onSave: (patch: Record<string, unknown>) => void }) {
  const { boot, online } = useApp();
  const { plan, suggested } = data;
  const focus = plan.saved ? plan.focus : suggested.focus;
  const ceilings = plan.saved ? plan.ceilings : suggested.ceilings;
  const spendTypes = boot.energy_types.filter((e) => e.direction === "spend");

  // An edit to an unsaved day saves the carried-forward plan with it.
  const saveWith = (patch: { focus?: string[]; ceilings?: Record<string, number> }) =>
    onSave({ focus, ceilings, ...patch });

  const setCeiling = (id: number, v: number | null) => {
    const next = { ...ceilings };
    if (v === null) delete next[id];
    else next[id] = Math.max(0, Math.min(24, v));
    saveWith({ ceilings: next });
  };

  return (
    <Panel title="Morning · plan">
      {!plan.saved && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: palette.panelDim, borderRadius: 6, padding: "8px 10px" }}>
          <span style={{ flex: 1, color: palette.muted, fontSize: 12 }}>
            {Object.keys(suggested.ceilings).length || suggested.focus.length ? "Carried forward from your last plan." : "No plan yet for this day."}
          </span>
          <WriteButton size="small" type="primary" onClick={() => saveWith({})}>
            Keep this plan
          </WriteButton>
        </div>
      )}

      <Heading>Focus</Heading>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {boot.areas.map((a) => (
          <Tag.CheckableTag
            key={a.id}
            checked={focus.includes(a.name)}
            onChange={(on) => online && saveWith({ focus: on ? [...focus, a.name] : focus.filter((f) => f !== a.name) })}
            style={{ border: `1px solid ${palette.border}`, marginInlineEnd: 0 }}
          >
            {a.name}
          </Tag.CheckableTag>
        ))}
      </div>

      <Heading>Ceilings</Heading>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {spendTypes.map((e) => {
          const v = ceilings[e.id];
          const held = !plan.saved ? suggested.held[e.id] : undefined;
          return (
            <div key={e.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1 }}>{e.name}</span>
                <Button size="small" icon={<MinusOutlined />} disabled={!online || v === undefined || v <= 0} onClick={() => setCeiling(e.id, (v ?? 0) - STEP)} aria-label={`Lower ${e.name} ceiling`} />
                <span style={{ width: 48, textAlign: "center", fontVariantNumeric: "tabular-nums", color: v === undefined ? palette.subtle : palette.fg }}>
                  {v === undefined ? "–" : formatHours(v)}
                </span>
                <Button size="small" icon={<PlusOutlined />} disabled={!online} onClick={() => setCeiling(e.id, v === undefined ? STEP * 2 : v + STEP)} aria-label={`Raise ${e.name} ceiling`} />
                <Tooltip title="No ceiling">
                  <Button size="small" type="text" icon={<CloseOutlined />} disabled={!online || v === undefined} onClick={() => setCeiling(e.id, null)} />
                </Tooltip>
              </div>
              {held && (
                <div style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>
                  {held.day <= 3
                    ? `Holding at ${formatHours(v)} after "too high" on ${shortDate(held.since)} (day ${held.day} of 3).`
                    : `Easing back toward ${formatHours(held.from)} after "too high" on ${shortDate(held.since)}.`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Heading>In force</Heading>
      <InForce data={data} />
    </Panel>
  );
}

export function InForce({ data }: { data: DayData }) {
  if (data.in_force.length === 0) return <div style={{ color: palette.subtle, fontSize: 12 }}>Nothing in force.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {data.in_force.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          <span style={{ color: palette.muted, fontSize: 12 }}>
            {s.kind} · {severityText(s)} · day {s.days_running}
            {s.ended ? " · ended, not cleared" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
