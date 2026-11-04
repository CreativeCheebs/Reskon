// The whole palette. Every colour in the UI comes from here.
//
// The default theme's surfaces and text follow Atlassian's (Jira's) 2022-2024 dark palette:
// distinct surface levels so page, columns, cards and overlays read as
// layers, softer text than pure white, borders that are visible. Checked on
// 2026-10-29 against the published @atlaskit/tokens 20.8.2 (whose current
// dark theme moved to neutral greys, page #1F1F21) and @primer/primitives
// 11.10.0; every text colour here passes WCAG AA (4.5:1) on cards. See
// docs/decisions.md for the measured comparison.
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

/** JitterBug's own default theme. */
export const DEFAULT_COLORS: Palette = {
  bg: "#1D2125", // page (elevation.surface)
  panel: "#22272B", // cards, tables, raised things (surface.raised)
  panelDim: "#161A1D", // board columns, sunken wells (surface.sunken)
  overlay: "#282E33", // drawers, modals, menus (surface.overlay)
  hover: "#2C333A", // hovered rows and cards
  selected: "#1C2B41", // selected nav item / row
  border: "#38414A", // dividers, card and column outlines
  borderStrong: "#4B5560", // input outlines, scrollbars
  fg: "#DCE2E8", // primary text
  muted: "#9FADBC", // secondary text
  subtle: "#8C9BAB", // least important text, placeholders
  accent: "#579DFF", // links, primary buttons, focus
  success: "#4BCE97",
  warn: "#F5CD47",
  danger: "#F87168",
  epic: "#9F8FEF", // the epic symbol and labels
  shadow: "#030404", // card and menu shadows (drawn semi-transparent)
  // Difficulty 1-5: Material Design 400 blue, green, yellow, orange, red.
  difficulty1: "#42A5F5",
  difficulty2: "#66BB6A",
  difficulty3: "#FFEE58",
  difficulty4: "#FFA726",
  difficulty5: "#EF5350",
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

/** fg blended over bg at alpha, as an opaque #rrggbb. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return "#" + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

/** The colour, lightened toward white only as far as needed to reach
 *  `min` contrast on bg (WCAG AA for text is 4.5). Dark user-chosen
 *  colours such as Backlog grey stay recognisable but become readable. */
export function readable(color: string, bg: string, min = 4.5): string {
  for (let step = 0; step <= 20; step++) {
    const c = blend("#ffffff", color, step / 20);
    if (contrast(c, bg) >= min) return c;
  }
  return "#ffffff";
}
