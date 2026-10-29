import type { ReactNode } from "react";
import { palette, tint } from "./palette";

// A Jira-style label: the colour as text on a faint tint of itself, so any
// user-chosen colour stays readable on the dark surfaces (a solid fill with
// white text does not: yellow and light grey become unreadable).

export function Lozenge({ color, children, strong }: { color?: string | null; children: ReactNode; strong?: boolean }) {
  const c = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : palette.muted;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 6px",
        borderRadius: 3,
        fontSize: 11,
        lineHeight: "18px",
        fontWeight: strong ? 700 : 600,
        textTransform: strong ? "uppercase" : undefined,
        letterSpacing: strong ? 0.2 : undefined,
        color: c,
        background: tint(c, 0.16),
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
