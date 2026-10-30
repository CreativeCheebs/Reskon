import { Table } from "antd";
import { palette } from "../../theme/palette";
import { formatValue, keyLabel } from "../format";
import { TIME_GROUPS, type MetricResult } from "../types";

// number, list and table: plain markup over the server's points.

/** One big figure (the server's reduced total), or one per point when the
 *  query is grouped by something other than time (open tasks by status). */
export function NumberViz({ res }: { res: MetricResult }) {
  if (res.metric === "drift") return <DriftViz res={res} />;
  const each = !TIME_GROUPS.includes(res.group) && res.series.length === 0 && res.points.length > 1 && res.reduce !== "count";
  if (each) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignContent: "center", height: "100%" }}>
        {res.points.map((p) => (
          <Figure key={p.key} value={formatValue(p.value, res.unit, res.metric)} label={p.label} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
      <Figure value={res.unit === "list" ? String(res.total) : formatValue(res.total, res.unit, res.metric)} big />
    </div>
  );
}

function Figure({ value, label, big }: { value: string; label?: string; big?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: big ? 34 : 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {label && <div style={{ color: palette.muted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>}
    </div>
  );
}

/** "Day 7 of a 2-day break." Elapsed as fact: no colour, no nudge. Greyed
 *  out until there is a morning plan to compare against. */
function DriftViz({ res }: { res: MetricResult }) {
  const m = res.meta ?? {};
  const run = Number(m.run ?? 0);
  const planned = Number(m.planned_break ?? 0);
  if (!m.has_plans) {
    return (
      <div style={{ color: palette.subtle, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <div style={{ fontSize: 28, fontWeight: 600 }}>–</div>
        <div style={{ fontSize: 12 }}>Needs a morning plan to compare against.</div>
      </div>
    );
  }
  let text: string;
  if (m.counted_types === 0) {
    return (
      <div style={{ color: palette.subtle, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <div style={{ fontSize: 28, fontWeight: 600 }}>–</div>
        <div style={{ fontSize: 12 }}>Choose which energy types count for Drift in Settings.</div>
      </div>
    );
  }
  if (run === 0) text = "No low run today.";
  else if (planned > 0) text = `Day ${run} of a ${planned}-day break.`;
  else text = `Day ${run} of a low run. No break was planned.`;
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{text}</div>
      {run > 0 && <div style={{ color: palette.muted, fontSize: 12 }}>Under {String(m.low_hours)}h a day of the counted types, since {String(m.run_start)}.</div>}
    </div>
  );
}

/** Named events: a date or name, and what happened. No count-up framing. */
export function ListViz({ res }: { res: MetricResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {res.points.map((p) => (
        <div key={p.key + (p.split ?? "")} style={{ display: "flex", gap: 10, alignItems: "baseline", minWidth: 0 }}>
          <span style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap" }}>{keyLabel(res, p.key, p.label, true)}</span>
          <span style={{ color: palette.muted, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{p.detail}</span>
        </div>
      ))}
    </div>
  );
}

export function TableViz({ res }: { res: MetricResult }) {
  const hasDetail = res.points.some((p) => p.detail);
  return (
    <Table
      size="small"
      pagination={false}
      rowKey={(p) => p.key + (p.split ?? "")}
      dataSource={res.points}
      columns={[
        { key: "label", title: "", ellipsis: true, render: (_, p) => keyLabel(res, p.key, p.label, true) },
        ...(hasDetail ? [{ key: "detail", title: "", width: "30%", ellipsis: true, render: (_: unknown, p: { detail?: string }) => <span style={{ color: palette.muted }}>{p.detail}</span> }] : []),
        { key: "value", title: "", width: 80, align: "right" as const, render: (_, p) => formatValue(p.value, res.unit, res.metric) },
      ]}
      showHeader={false}
    />
  );
}
