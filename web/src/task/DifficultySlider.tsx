import { useEffect, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { palette } from "../theme/palette";
import { levelName } from "../types";
import { DifficultyIcon } from "./LevelIcons";

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
        tooltip={{ formatter: (v) => (v ? levelName(v) : "") }}
        onChange={(v) => setDraft(v)}
        onChangeComplete={(v) => v !== value && onChange(v)}
        aria-label="Level"
      />
      <span style={{ fontSize: 11, color: unset ? palette.subtle : palette.fg, minWidth: 70, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
        {!unset && <DifficultyIcon level={draft} tip={false} decorative />}
        {unset ? "Not set" : levelName(draft)}
      </span>
      {!unset && !disabled && (
        <Tooltip title="Clear level">
          <Button size="small" type="text" aria-label="Clear level" style={{ padding: 0, width: 18, minWidth: 18, color: palette.subtle }} onClick={() => onChange(null)}>
            ✕
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
