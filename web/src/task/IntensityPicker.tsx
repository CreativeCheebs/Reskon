import { Tooltip } from "antd";
import { palette } from "../theme/palette";
import { DIFFICULTY_LABELS } from "../types";
import { DifficultyIcon } from "./LevelIcons";

// Intensity 1-5 as a row of five symbol buttons, for forms where a slider
// would take a whole row. Clicking the chosen one again clears it; with
// none chosen every symbol is dimmed and the label says "Not set".

export function IntensityPicker({
  value,
  onChange,
  disabled,
  label = "Intensity",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <div role="group" aria-label={label} style={{ display: "inline-flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Tooltip key={n} title={`${n} · ${DIFFICULTY_LABELS[n]}${on ? " (click to clear)" : ""}`} mouseEnterDelay={0.3}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${label} ${n}, ${DIFFICULTY_LABELS[n]}`}
                disabled={disabled}
                onClick={() => onChange(on ? null : n)}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: on ? palette.selected : "transparent",
                  border: `1px solid ${on ? palette.accent : palette.border}`,
                  opacity: on ? 1 : value === null ? 0.7 : 0.4,
                }}
              >
                <DifficultyIcon level={n} tip={false} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <span style={{ fontSize: 11, whiteSpace: "nowrap", color: value === null ? palette.subtle : palette.muted }}>
        {value === null ? "Not set" : DIFFICULTY_LABELS[value]}
      </span>
    </div>
  );
}
