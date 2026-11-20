import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { blend, palette, readable } from "./palette";

// A small pill for card metadata: a symbol and a word or number on a faint
// tint of its colour. Colour is never the only signal; the text says it too.
// Without a colour it is neutral, for figures that only need to be readable.
// A chip with only a symbol passes `label`, which screen readers say instead.

export function Chip({
  color,
  icon,
  children,
  tip,
  label,
}: {
  color?: string | null;
  icon?: ReactNode;
  children?: ReactNode;
  tip?: ReactNode;
  label?: string;
}) {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  const bg = base ? blend(base, palette.panel, 0.16) : blend(palette.muted, palette.panel, 0.1);
  const fg = base ? readable(base, bg) : palette.muted;
  const chip = (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: children === undefined ? "0 4px" : "0 7px 0 5px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "24px",
        color: fg,
        background: bg,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {icon}
      {children}
    </span>
  );
  return tip ? (
    <Tooltip title={tip} mouseEnterDelay={0.3}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
