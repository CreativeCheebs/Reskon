import type { StateRow } from "../day/types";

// Words for the severity scale. Severity is a plain number on the server;
// the form offers 0 to 5 in half steps, and these bands say what a value
// roughly means. Indicative only: personal language is fine.

export const SEVERITY_MAX = 5;

interface Band {
  upTo: number;
  name: string;
  /** What it means for a debuff or modifier, and for a buff. */
  hint: string;
  buffHint: string;
}

const BANDS: Band[] = [
  { upTo: 0, name: "None", hint: "Not felt right now.", buffHint: "Not felt right now." },
  { upTo: 1.5, name: "Mild", hint: "Doesn't affect much.", buffHint: "A small lift." },
  { upTo: 3, name: "Moderate", hint: "Affects a little bit in every part of life.", buffHint: "Helps a little in every part of life." },
  { upTo: Infinity, name: "Severe", hint: "Affects a lot, and it's noticeable.", buffHint: "A big lift, and it's noticeable." },
];

export function severityBand(severity: number, kind: StateRow["kind"] = "debuff") {
  const b = BANDS.find((x) => severity <= x.upTo + 1e-9) ?? BANDS[BANDS.length - 1];
  const name = kind === "buff" && b.name === "Severe" ? "Strong" : b.name;
  return { name, hint: kind === "buff" ? b.buffHint : b.hint };
}
