import { palette } from "../theme/palette";

// The colours Reskon hands an app's page (docs/plugins.md section 5), from
// the active theme. "bg" is the widget's own background, so a page that
// uses it blends into the widget; "surface" is for things on it.

export interface PluginTheme {
  mode: "dark" | "light";
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  font: string;
  radius: number;
}

/** Relative brightness of a #rrggbb colour, 0 (black) to 1 (white). */
function brightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return 0;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export function pluginTheme(): PluginTheme {
  return {
    mode: brightness(palette.bg) < 0.5 ? "dark" : "light",
    bg: palette.panel,
    surface: palette.overlay,
    text: palette.fg,
    muted: palette.muted,
    accent: palette.accent,
    border: palette.border,
    // The page cannot load Reskon's own font file, so a font every machine has.
    font: "system-ui, sans-serif",
    radius: 6,
  };
}
