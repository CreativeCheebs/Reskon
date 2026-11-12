import { Tooltip } from "antd";
import { palette } from "../theme/palette";
import { levelName, type Priority } from "../types";

// Small symbols for level and priority, so cards carry them without
// words. Every colour comes from the theme (difficulty) or the priority's own
// colour (Settings → Priorities).

/** The level as slanted lines: one for level 1 up to five for level 5, in the
 *  theme's level colours (pale to deep blue, never red: a restful level 5 is
 *  not a warning). The count of lines says the level without the colour. */
export function DifficultyIcon({
  level,
  size = 14,
  tip = true,
  decorative = false,
}: {
  level: number;
  size?: number;
  tip?: boolean;
  /** The words "Level N" are already beside it, so a screen reader skips the icon. */
  decorative?: boolean;
}) {
  const i = Math.min(5, Math.max(1, Math.round(level)));
  const color = palette[`difficulty${i}` as "difficulty1"];
  const icon = (
    <svg
      width={(size * VIEW_W) / VIEW_H}
      height={size}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `Level ${i}` })}
      style={{ flex: "none", display: "block" }}
    >
      {slantLines(i).map((d, k) => (
        <path key={k} d={d} stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      ))}
    </svg>
  );
  if (!tip) return icon;
  return (
    <Tooltip title={`${levelName(i)} of 5`} mouseEnterDelay={0.3}>
      <span style={{ display: "inline-flex" }}>{icon}</span>
    </Tooltip>
  );
}

const VIEW_W = 24;
const VIEW_H = 16;

/** Path data for n slanted lines (like "/"), evenly spaced across the icon. */
export function slantLines(n: number): string[] {
  const gap = 4;
  const slant = 3;
  const first = (VIEW_W - slant - (n - 1) * gap) / 2 + slant; // keep the group centred
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const x = first + k * gap;
    out.push(`M${x.toFixed(2)} 2.5L${(x - slant).toFixed(2)} 13.5`);
  }
  return out;
}

/** -2 lowest ... 0 middle ... 2 highest, from the priority's rank by weight
 *  among all priorities (never its name). */
export function priorityLevel(p: Priority, all: Priority[]): number {
  const ranked = [...all].sort((a, b) => a.weight - b.weight || a.position - b.position);
  const d = ranked.findIndex((r) => r.id === p.id) - (ranked.length - 1) / 2;
  if (d === 0) return 0;
  return Math.sign(d) * (Math.abs(d) <= 1 ? 1 : 2);
}

/** Colours for a priority with none of its own, by level: blue for the
 *  lowest up to red for the highest. Also what "Use suggested colours" in
 *  Settings → Priorities writes. */
export const PRIORITY_LEVEL_COLORS: Record<number, string> = {
  [-2]: "#579DFF",
  [-1]: "#4BCE97",
  0: "#F5CD47",
  1: "#FEA362",
  2: "#F87168",
};

/** The priority's own colour, else the colour for its level. */
export function priorityColor(p: Priority, all: Priority[]): string {
  return p.color && /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : PRIORITY_LEVEL_COLORS[priorityLevel(p, all)];
}

/** Jira-style: double chevron, chevron, equals, chevron down, double
 *  chevron down, in the priority's colour. */
export function PriorityIcon({ priority, all, size = 14, tip = true }: { priority: Priority; all: Priority[]; size?: number; tip?: boolean }) {
  const level = priorityLevel(priority, all);
  const color = priorityColor(priority, all);
  const chevron = (y: number, up: boolean) => (up ? `M3.5 ${y + 3}L8 ${y - 1.5}L12.5 ${y + 3}` : `M3.5 ${y - 3}L8 ${y + 1.5}L12.5 ${y - 3}`);
  let d: string;
  if (level === 0) d = "M3 6H13M3 10H13";
  else if (Math.abs(level) === 1) d = chevron(level > 0 ? 7 : 9, level > 0);
  else d = level > 0 ? chevron(5, true) + chevron(10, true) : chevron(6, false) + chevron(11, false);
  const icon = (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`Priority ${priority.name}`} style={{ flex: "none", display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (!tip) return icon;
  return (
    <Tooltip title={`Priority: ${priority.name}`} mouseEnterDelay={0.3}>
      <span style={{ display: "inline-flex" }}>{icon}</span>
    </Tooltip>
  );
}

/** Select options for a priority picker: symbol and name. */
export function priorityOptions(all: Priority[]) {
  return [...all]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      value: p.id,
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <PriorityIcon priority={p} all={all} tip={false} /> {p.name}
        </span>
      ),
    }));
}
