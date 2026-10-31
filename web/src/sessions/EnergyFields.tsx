import { Button, Form, InputNumber, Select, Typography } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { formatHM } from "../format";
import { palette } from "../theme/palette";
import { IntensityPicker } from "../task/IntensityPicker";
import { draftParts, withParts, type EnergyPart, type SessionDraft } from "./SessionForm";

// The session's energy types, each with its intensity, and with two or
// more, each one's share of the hours. Splitting across types is a small
// link beside the label, so it never sits in the way of the main fields.

const MAX_ENERGIES = 4;

export function EnergyFields({
  draft,
  onChange,
  disabled,
  onFirstType,
  onFirstIntensity,
}: {
  draft: SessionDraft;
  onChange: (d: SessionDraft) => void;
  disabled?: boolean;
  onFirstType: () => void;
  onFirstIntensity: () => void;
}) {
  const { boot } = useApp();
  const parts = draftParts(draft);
  const several = parts.length > 1;
  const total = parts.reduce((n, p) => n + p.share, 0);
  const setParts = (ps: EnergyPart[], patch: Partial<SessionDraft> = {}) => onChange({ ...withParts(draft, ps), ...patch });
  const setPart = (i: number, patch: Partial<EnergyPart>) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Moving one share moves another the other way, so they keep adding up
  // to 100: the last one, or the one before it when the last is moved.
  const setShare = (i: number, v: number) => {
    const ps = parts.map((p) => ({ ...p }));
    const other = i === ps.length - 1 ? i - 1 : ps.length - 1;
    const want = Math.min(99, Math.max(1, Math.round(v)));
    const delta = want - ps[i].share;
    ps[i].share = want;
    ps[other].share = Math.max(1, ps[other].share - delta);
    setParts(ps);
  };
  // A new type takes half of the biggest share.
  const addPart = () => {
    const ps = parts.map((p) => ({ ...p }));
    const big = ps.reduce((b, p, j) => (p.share > ps[b].share ? j : b), 0);
    const give = Math.max(1, Math.floor(ps[big].share / 2));
    if (ps[big].share - give < 1) return;
    ps[big].share -= give;
    ps.push({ energy_type_id: null, share: give, difficulty: null });
    setParts(ps);
  };
  // A removed type's share goes to the one above it.
  const removePart = (i: number) => {
    const ps = parts.filter((_, j) => j !== i).map((p) => ({ ...p }));
    ps[Math.max(0, i - 1)].share += parts[i].share;
    if (ps.length === 1) ps[0].share = 100;
    setParts(ps);
  };

  const taken = new Set(parts.map((p) => p.energy_type_id));
  const label = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
      {several ? "Energy types · share · intensity" : "Energy type · intensity"}
      {!disabled && parts.length < MAX_ENERGIES && (
        <Typography.Link onClick={addPart} style={{ fontSize: 12, fontWeight: 400 }}>
          <PlusOutlined /> {several ? "Add another" : "Split across types"}
        </Typography.Link>
      )}
    </span>
  );
  return (
    <Form.Item
      label={label}
      required
      style={{ marginBottom: 10 }}
      help={
        several && total !== 100 ? (
          <span style={{ color: palette.warn }}>Shares add up to {total}%; they need to add up to 100%.</span>
        ) : undefined
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {parts.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Select
              style={{ flex: "1 1 130px", minWidth: 120, maxWidth: 200 }}
              placeholder="Energy type"
              aria-label={several ? `Energy type ${i + 1}` : "Energy type"}
              value={p.energy_type_id ?? undefined}
              onChange={(v) => {
                if (i === 0) onFirstType();
                if (!several) setParts([{ ...p, energy_type_id: v }], { subtypes: [] });
                else setPart(i, { energy_type_id: v });
              }}
              options={boot.energy_types.map((e) => ({ value: e.id, label: e.name, disabled: e.id !== p.energy_type_id && taken.has(e.id) }))}
            />
            {several && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <InputNumber
                  style={{ width: 68 }}
                  min={1}
                  max={99}
                  value={p.share}
                  formatter={(v) => `${v}%`}
                  parser={(v) => Number((v ?? "").replace("%", "")) || 1}
                  onChange={(v) => v !== null && setShare(i, v)}
                  aria-label="Share of the hours"
                />
                <span style={{ fontSize: 11, color: palette.muted, minWidth: 40 }}>
                  {draft.hours ? formatHM((draft.hours * p.share) / 100) : ""}
                </span>
              </span>
            )}
            <IntensityPicker
              value={p.difficulty}
              disabled={disabled}
              label={several ? `Intensity for energy type ${i + 1}` : "Intensity"}
              onChange={(v) => {
                if (i === 0) onFirstIntensity();
                setPart(i, { difficulty: v });
              }}
            />
            {several && !disabled && (
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => removePart(i)} aria-label="Remove this energy type" />
            )}
          </div>
        ))}
      </div>
    </Form.Item>
  );
}
