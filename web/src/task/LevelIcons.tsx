import { Tooltip } from "antd";
import { palette } from "../theme/palette";
import { DIFFICULTY_LABELS, type Priority } from "../types";

// Small symbols for difficulty and priority, so cards carry them without
// words. Every colour comes from the theme (difficulty) or the priority's own
// colour (Settings → Priorities).

const DIFFICULTY_SIDES = [0, 3, 4, 5, 6]; // 0 = circle

/** A ring with a shape inside: circle, triangle, square, pentagon, hexagon
 *  for difficulty 1 to 5, in the theme's difficulty1..5 colours. */
export function DifficultyIcon({ level, size = 14, tip = true }: { level: number; size?: number; tip?: boolean }) {
  const i = Math.min(5, Math.max(1, Math.round(level)));
  const color = palette[`difficulty${i}` as "difficulty1"];
  const sides = DIFFICULTY_SIDES[i - 1];
  const icon = (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={`Intensity ${i}`} style={{ flex: "none", display: "block" }}>
      <circle cx="8" cy="8" r="7" fill="none" stroke={color} strokeWidth="1.5" />
      {sides === 0 ? <circle cx="8" cy="8" r="3" fill={color} /> : <polygon points={polygon(sides, 3.9)} fill={color} />}
    </svg>
  );
  if (!tip) return icon;
  return (
    <Tooltip title={`Intensity ${i} of 5 · ${DIFFICULTY_LABELS[i] ?? ""}`} mouseEnterDelay={0.3}>
      <span style={{ display: "inline-flex" }}>{icon}</span>
    </Tooltip>
  );
}

/** Regular polygon around (8, 8): one point straight up, except the square,
 *  which sits flat. A triangle sits a little low so it looks centred. */
function polygon(sides: number, r: number): string {
  const dy = sides === 3 ? 0.8 : 0;
  const start = sides === 4 ? -Math.PI / 4 : -Math.PI / 2;
  const pts: string[] = [];
  for (let k = 0; k < sides; k++) {
    const a = start + (k * 2 * Math.PI) / sides;
    pts.push(`${(8 + r * Math.cos(a)).toFixed(2)},${(8 + dy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
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
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={`Priority ${priority.name}`} style={{ flex: "none", display: "block" }}>
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
