import { useState } from "react";
import { DatePicker, Form, Input, InputNumber, Modal, Radio, Segmented, Slider } from "antd";
import dayjs from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { today } from "../format";
import type { StateRow } from "../day/types";
import { DecaySketch } from "./DecaySketch";
import { SEVERITY_MAX, SeverityIcon, severityBand } from "./severity";

// Add or edit a buff, debuff or modifier. Decay defaults to static (holds
// until cleared); there is no auto-clear. Severity is a slider from 0 to 5
// in half steps, each step named with what it roughly feels like; a larger
// value saved before stretches the slider to fit.

const SHAPES: { value: StateRow["decay"]; label: string; hint: string }[] = [
  { value: "static", label: "Static", hint: "Holds until cleared" },
  { value: "linear", label: "Linear", hint: "Even fade" },
  { value: "fast", label: "Fast", hint: "Steep early recovery, long tail" },
  { value: "slow", label: "Slow", hint: "Lingers, then drops" },
];

export function StateForm({
  editing,
  shapes,
  onClose,
  onSaved,
}: {
  editing?: StateRow;
  shapes: Record<string, number[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { online } = useApp();
  const [v, setV] = useState({
    name: editing?.name ?? "",
    kind: editing?.kind ?? ("debuff" as StateRow["kind"]),
    severity: editing?.severity ?? 1,
    started_on: editing?.started_on ?? today(),
    duration_days: editing?.duration_days ?? null,
    decay: editing?.decay ?? ("static" as StateRow["decay"]),
    cleared_on: editing?.cleared_on ?? null,
    note: editing?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...v, name: v.name.trim(), note: v.note || null };
      if (editing) await api.patch(`/states/${editing.id}`, body);
      else await api.post("/states", body);
      onSaved();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const item = { style: { marginBottom: 10 } };
  return (
    <Modal open title={editing ? "Edit" : "Add a buff or debuff"} okText="Save" onOk={save} onCancel={onClose} width={520}
      okButtonProps={{ loading: busy, disabled: !online || !v.name.trim() }}>
      <Form layout="vertical" size="small">
        <Form.Item label="Name" {...item}>
          <Input autoFocus value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="In your own words" />
        </Form.Item>
        <Form.Item label="Kind" {...item}>
          <Segmented value={v.kind} onChange={(kind) => set({ kind: kind as StateRow["kind"] })} options={["debuff", "buff", "modifier"]} />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Form.Item label="Started" {...item}>
            <DatePicker allowClear={false} value={dayjs(v.started_on)} onChange={(d) => d && set({ started_on: d.format("YYYY-MM-DD") })} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Duration (optional)" {...item} extra="Without one, it holds at full severity.">
            <InputNumber min={1} addonAfter="days" value={v.duration_days} onChange={(n) => set({ duration_days: n ?? null })} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <SeverityField kind={v.kind} value={v.severity} onChange={(severity) => set({ severity })} />
        <Form.Item label="Decay" {...item}>
          <Radio.Group value={v.decay} onChange={(e) => set({ decay: e.target.value })} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {SHAPES.map((s) => (
              <Radio.Button key={s.value} value={s.value} style={{ height: "auto", padding: "6px 10px", lineHeight: 1.3, borderRadius: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <DecaySketch points={shapes[s.value]} />
                  <span>
                    <span style={{ display: "block", fontWeight: 600 }}>{s.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: palette.muted }}>{s.hint}</span>
                  </span>
                </span>
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        {editing && (
          <Form.Item label="Cleared on" {...item} extra="The first day it no longer applied. Empty = still in force.">
            <DatePicker value={v.cleared_on ? dayjs(v.cleared_on) : null} onChange={(d) => set({ cleared_on: d ? d.format("YYYY-MM-DD") : null })} style={{ width: "100%" }} />
          </Form.Item>
        )}
        <Form.Item label="Note" {...item}>
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={v.note} onChange={(e) => set({ note: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SeverityField({ kind, value, onChange }: { kind: StateRow["kind"]; value: number; onChange: (n: number) => void }) {
  const max = Math.max(SEVERITY_MAX, Math.ceil(value));
  const band = severityBand(value, kind);
  const marks: Record<number, { label: React.ReactNode }> = {};
  for (let n = 0; n <= max; n++) marks[n] = { label: <span style={{ fontSize: 11, color: palette.subtle }}>{n}</span> };
  return (
    <Form.Item label="Severity" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Slider
          min={0}
          max={max}
          step={0.5}
          dots
          value={value}
          onChange={onChange}
          marks={marks}
          tooltip={{ formatter: (n) => `${n} · ${severityBand(n ?? 0, kind).name}` }}
          style={{ flex: 1, margin: "6px 6px 18px" }}
        />
        <InputNumber min={0} step={0.5} value={value} onChange={(n) => onChange(n ?? 0)} style={{ width: 70 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: palette.muted }}>
        <SeverityIcon kind={kind} severity={value} />
        <span style={{ fontWeight: 600, color: palette.fg }}>{band.name}</span> · {band.hint}
      </div>
    </Form.Item>
  );
}
