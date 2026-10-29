import { useEffect, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { palette } from "../theme/palette";
import { DIFFICULTY_LABELS } from "../types";

// Difficulty is a 1-5 scale, optional. The slider reports a value only when
// you let go (onChange), so dragging doesn't save five times.

export function DifficultySlider({
  value,
  onChange,
  disabled,
  width = 150,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  width?: number;
}) {
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  const unset = draft === null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width }}>
      <Slider
        min={1}
        max={5}
        step={1}
        dots
        disabled={disabled}
        value={draft ?? 1}
        style={{ flex: 1, margin: "0 6px", opacity: unset ? 0.45 : 1 }}
        tooltip={{ formatter: (v) => (v ? `${v} · ${DIFFICULTY_LABELS[v]}` : "") }}
        onChange={(v) => setDraft(v)}
        onChangeComplete={(v) => v !== value && onChange(v)}
        aria-label="Difficulty"
      />
      <span style={{ fontSize: 11, color: unset ? palette.subtle : palette.fg, minWidth: 54, whiteSpace: "nowrap" }}>
        {unset ? "Not set" : `${draft} · ${DIFFICULTY_LABELS[draft]}`}
      </span>
      {!unset && !disabled && (
        <Tooltip title="Clear difficulty">
          <Button size="small" type="text" style={{ padding: 0, width: 18, minWidth: 18, color: palette.subtle }} onClick={() => onChange(null)}>
            ✕
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
