import type { ReactNode } from "react";
import { blend, palette, readable } from "./palette";

// A Jira-style label: the colour as text on a faint tint of itself. The text
// is lightened as far as needed for WCAG AA (4.5:1) on that tint, so any
// user-chosen colour stays readable — even dark greys like Backlog.

export function Lozenge({
  color,
  children,
  strong,
  on = palette.panel,
}: {
  color?: string | null;
  children: ReactNode;
  strong?: boolean;
  /** The surface the lozenge sits on (cards and tables: panel). */
  on?: string;
}) {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : palette.muted;
  const bg = blend(base, on, 0.16);
  const c = readable(base, bg);
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
        background: bg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
