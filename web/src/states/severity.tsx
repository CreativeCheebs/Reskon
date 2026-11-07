import { Tooltip } from "antd";
import { palette } from "../theme/palette";
import type { StateRow } from "../day/types";
import { pressable } from "../a11y";

// Words and a symbol for the severity scale. Severity is a number on the
// server; the form offers 0 to 5 in half steps, and each step has a name
// and what it roughly feels like (a pain-scale style ladder, compressed
// into 0-5). Indicative only: personal language is fine.

export const SEVERITY_MAX = 5;

interface Step {
  name: string;
  hint: string;
}

// Index = severity × 2 (0, 0.5, 1 … 5).
const DEBUFF: Step[] = [
  { name: "None", hint: "Not felt right now" },
  { name: "Very mild", hint: "Barely noticeable" },
  { name: "Very low", hint: "Noticeable" },
  { name: "Low", hint: "Distracting sometimes" },
  { name: "Intermediate", hint: "Distracting usually" },
  { name: "Moderate", hint: "Interrupting" },
  { name: "High", hint: "Hard to ignore" },
  { name: "Very high", hint: "Can't ignore" },
  { name: "Severe", hint: "Awful" },
  { name: "Very severe", hint: "Hard to bear" },
  { name: "Unbearable", hint: "Can't function" },
];

const BUFF: Step[] = [
  { name: "None", hint: "Not felt right now" },
  { name: "Very mild", hint: "Barely noticeable" },
  { name: "Very low", hint: "Noticeable" },
  { name: "Low", hint: "Helps sometimes" },
  { name: "Intermediate", hint: "Helps usually" },
  { name: "Moderate", hint: "Lifts the day" },
  { name: "High", hint: "Hard to miss" },
  { name: "Very high", hint: "Carries everything" },
  { name: "Strong", hint: "Great" },
  { name: "Very strong", hint: "Excellent" },
  { name: "Peak", hint: "Best it gets" },
];

/** The step a severity falls on (nearest half), for a kind. */
export function severityBand(severity: number, kind: StateRow["kind"] = "debuff"): Step {
  const steps = kind === "buff" ? BUFF : DEBUFF;
  const i = Math.min(steps.length - 1, Math.max(0, Math.round(severity * 2)));
  return steps[i];
}

// Colour by kind and how strong it is: a debuff is a warning, yellow when
// mild and red when severe; a buff goes from blue (mild) to green (strong);
// a modifier is neither good nor bad, so it stays the accent blue.
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const v = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t));
  return "#" + v.map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function severityColor(kind: StateRow["kind"], severity: number): string {
  const t = Math.min(1, Math.max(0, severity / SEVERITY_MAX));
  if (kind === "debuff") return mix(palette.warn, palette.danger, t);
  if (kind === "buff") return mix(palette.accent, palette.success, t);
  return palette.accent;
}

/** A ring in the kind's colour, filled clockwise by severity out of 5. */
export function SeverityIcon({ kind, severity, size = 14 }: { kind: StateRow["kind"]; severity: number; size?: number }) {
  const color = severityColor(kind, severity);
  const f = Math.min(1, Math.max(0, severity / SEVERITY_MAX));
  const r = 4.6;
  let fill = null;
  if (f >= 0.999) fill = <circle cx="8" cy="8" r={r} fill={color} />;
  else if (f > 0) {
    const a = -Math.PI / 2 + f * 2 * Math.PI;
    const x = (8 + r * Math.cos(a)).toFixed(2);
    const y = (8 + r * Math.sin(a)).toFixed(2);
    fill = <path d={`M8 8V${8 - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y}Z`} fill={color} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`Severity ${Math.round(severity * 10) / 10}`} style={{ flex: "none", display: "block" }}>
      <circle cx="8" cy="8" r="7" fill="none" stroke={color} strokeWidth="1.5" />
      {fill}
    </svg>
  );
}

/** Icon, name and step, with what it feels like on hover. */
export function StateChip({ s, onClick }: { s: StateRow; onClick?: () => void }) {
  const band = severityBand(s.effective_severity, s.kind);
  return (
    <Tooltip title={`${s.kind} · ${Math.round(s.effective_severity * 10) / 10} of 5 · ${band.hint}${s.ended ? " · ended, not cleared" : ""}`}>
      <span
        {...pressable(onClick)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          // Whole-pixel height (26px), so everything under the bar sits on
          // whole pixels and stays sharp.
          height: 26,
          boxSizing: "border-box",
          lineHeight: "20px",
          padding: "0 8px",
          borderRadius: 13,
          border: `1px solid ${palette.border}`,
          background: palette.panel,
          fontSize: 12,
          whiteSpace: "nowrap",
          cursor: onClick ? "pointer" : undefined,
        }}
      >
        <SeverityIcon kind={s.kind} severity={s.effective_severity} />
        <span style={{ fontWeight: 600 }}>{s.name}</span>
        <span style={{ color: palette.muted }}>{band.name}</span>
      </span>
    </Tooltip>
  );
}
