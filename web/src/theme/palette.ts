// The whole palette. Every colour in the UI comes from here.
//
// Based on the Atlassian (Jira) dark theme tokens: distinct surface levels
// so the page, board columns, cards and overlays read as layers, softer
// text than pure white, and borders that are actually visible.
export const palette = {
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
} as const;

/** A hex colour (#rrggbb) at the given opacity, for tinted backgrounds. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + a : hex;
}
