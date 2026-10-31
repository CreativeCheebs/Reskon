import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { blend, palette, readable } from "./palette";

// A small pill for card metadata: a symbol and a word or number on a faint
// tint of its colour. Colour is never the only signal; the text says it too.
// Without a colour it is neutral, for figures that only need to be readable.

export function Chip({ color, icon, children, tip }: { color?: string | null; icon?: ReactNode; children?: ReactNode; tip?: ReactNode }) {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  const bg = base ? blend(base, palette.panel, 0.16) : blend(palette.muted, palette.panel, 0.1);
  const fg = base ? readable(base, bg) : palette.muted;
  const chip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 20,
        padding: children === undefined ? "0 4px" : "0 7px 0 5px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "20px",
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
