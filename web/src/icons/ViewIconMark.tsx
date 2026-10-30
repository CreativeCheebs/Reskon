import { palette } from "../theme/palette";
import type { ViewIcon } from "../types";

// A view's icon. Emoji are text; SVG icons are drawn as a CSS mask filled
// with the view's colour, so the stored SVG is only ever an image — never
// markup in the page — and tints like any other glyph.

export function svgMaskUrl(body: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`)}")`;
}

export function IconGlyph({ icon, color, size = 16 }: { icon: ViewIcon; color?: string | null; size?: number }) {
  if (icon.emoji)
    return (
      <span style={{ fontSize: size, lineHeight: 1, width: size, textAlign: "center", flex: "none", display: "inline-block" }} aria-hidden>
        {icon.emoji}
      </span>
    );
  if (icon.svg) {
    const mask = svgMaskUrl(icon.svg);
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          flex: "none",
          display: "inline-block",
          background: color ?? "currentColor",
          WebkitMask: `${mask} center / contain no-repeat`,
          mask: `${mask} center / contain no-repeat`,
        }}
      />
    );
  }
  return null;
}

/** The icon in front of a view's name, or a dot in its colour when it has
 *  a colour but no icon, or nothing. */
export function ViewIconMark({ icon, color, size = 16 }: { icon: ViewIcon | undefined; color: string | null; size?: number }) {
  if (icon && (icon.emoji || icon.svg)) return <IconGlyph icon={icon} color={color ?? palette.muted} size={size} />;
  if (color)
    return (
      <span style={{ width: size, height: size, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      </span>
    );
  return null;
}
