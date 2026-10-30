import { palette } from "../theme/palette";

// A small drawing of a decay curve, from the server's samples of f(t) for
// t = 0 .. 1.25. The dashed line marks the end of the duration.

export function DecaySketch({ points, width = 56, height = 20, color = palette.accent }: { points?: number[]; width?: number; height?: number; color?: string }) {
  if (!points?.length) return <span style={{ display: "inline-block", width, height }} />;
  const step = width / (points.length - 1);
  const y = (v: number) => 2 + (1 - v) * (height - 4);
  const d = points.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const end = width / 1.25;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ flex: "none", display: "block" }}>
      <line x1={end} x2={end} y1={0} y2={height} stroke={palette.border} strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}
