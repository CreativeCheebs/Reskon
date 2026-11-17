// The whole palette. Every colour in the UI comes from here.
//
// The default theme uses Reskon's warm charcoal and periwinkle palette.
export const PALETTE_KEYS = [
  "bg",
  "panel",
  "panelDim",
  "overlay",
  "hover",
  "selected",
  "border",
  "borderStrong",
  "fg",
  "muted",
  "subtle",
  "accent",
  "success",
  "warn",
  "danger",
  "epic",
  "shadow",
  "difficulty1",
  "difficulty2",
  "difficulty3",
  "difficulty4",
  "difficulty5",
] as const;

/** Keys added after themes could be uploaded. A theme file without them
 *  still loads; the missing ones come from the default theme. */
export const LATER_KEYS: readonly PaletteKey[] = ["shadow", "difficulty1", "difficulty2", "difficulty3", "difficulty4", "difficulty5"];

export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

/** Reskon's own default theme. */
export const DEFAULT_COLORS: Palette = {
  bg: "#17171B",
  panel: "#242329",
  panelDim: "#201F23",
  overlay: "#2D2B31",
  hover: "#35333A",
  selected: "#353650",
  border: "#454249",
  borderStrong: "#827C85",
  fg: "#F0EAE5",
  muted: "#BDB6B8",
  subtle: "#B5ADB1",
  accent: "#A6AFF8",
  success: "#A3CDA4",
  warn: "#EFC979",
  danger: "#F3988F",
  epic: "#C2B2EF",
  shadow: "#08070A",
  difficulty1: "#D7D9F2",
  difficulty2: "#C3C8F4",
  difficulty3: "#AFB8F7",
  difficulty4: "#A6AFF8",
  difficulty5: "#929CF1",
};

/** The active colours. Components read this at render time; the theme
 *  provider replaces its contents and re-renders the app on a switch. */
export const palette: Palette = { ...DEFAULT_COLORS };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Replace the active colours. Only #rrggbb values are accepted, so a theme
 *  file can never inject anything else into styles. */
export function applyPalette(colors: Palette) {
  for (const k of PALETTE_KEYS) palette[k] = HEX.test(colors[k]) ? colors[k] : DEFAULT_COLORS[k];
  // Secondary text (muted, subtle) must stay readable (WCAG AA, 4.5:1) on
  // every surface it sits on, whatever the theme says. A too-dim colour is
  // moved toward the main text colour just far enough; a passing one is
  // left exactly as the theme has it.
  const surfaces = [palette.bg, palette.panel, palette.panelDim, palette.overlay, palette.hover];
  for (const k of ["muted", "subtle"] as const) palette[k] = readableOnAll(palette[k], palette.fg, surfaces);
}

/** color, blended toward `toward` only as far as needed to reach `min`
 *  contrast on every surface. If even `toward` falls short, `toward`. */
function readableOnAll(color: string, toward: string, surfaces: string[], min = 4.5): string {
  for (let step = 0; step <= 20; step++) {
    const c = blend(toward, color, step / 20);
    if (surfaces.every((s) => contrast(c, s) >= min)) return c;
  }
  return toward;
}


// ---------- contrast (WCAG 2.x) ----------

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on a solid fill of this colour
 *  (the text on a stacked bar segment). */
export function textOn(fill: string): string {
  return contrast("#000000", fill) >= contrast("#ffffff", fill) ? "#000000" : "#ffffff";
}

/** fg blended over bg at alpha, as an opaque #rrggbb. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return "#" + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

/** True when the page background is dark (so light text and Ant's dark controls fit). */
export function isDarkPalette(c: { bg: string } = palette): boolean {
  return contrast(c.bg, "#000000") < contrast(c.bg, "#ffffff");
}

/** The colour, moved toward white on a dark bg (toward black on a light one)
 *  only as far as needed to reach `min` contrast on bg (WCAG AA for text is
 *  4.5). Colours such as Backlog grey or a yellow priority stay recognisable
 *  but become readable in every theme. */
export function readable(color: string, bg: string, min = 4.5): string {
  const toward = contrast(bg, "#000000") < contrast(bg, "#ffffff") ? "#ffffff" : "#000000";
  for (let step = 0; step <= 20; step++) {
    const c = blend(toward, color, step / 20);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}
