import { contrast, DEFAULT_COLORS, LATER_KEYS, PALETTE_KEYS, type Palette, type PaletteKey } from "./palette";

// Themes: a name plus the palette colours. Built-in values for Jira and
// GitHub are taken from the published design-token packages
// (@atlaskit/tokens 20.8.2, @primer/primitives 11.10.0), not hand-picked.
// Translucent tokens were flattened onto the card surface.

export interface Theme {
  id: string;
  name: string;
  colors: Palette;
  /** Where the values come from, shown in the picker. */
  source?: string;
  builtin?: boolean;
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "default",
    name: "Default",
    builtin: true,
    source: "JitterBug (Atlassian 2022–24 dark palette)",
    colors: DEFAULT_COLORS,
  },
  {
    id: "jira",
    name: "Jira",
    builtin: true,
    source: "@atlaskit/tokens 20.8.2 · atlassian-dark",
    colors: {
      bg: "#1F1F21", panel: "#242528", panelDim: "#18191A", overlay: "#2B2C2F", hover: "#2B2C2F", selected: "#1C2B42",
      border: "#3B3C41", borderStrong: "#7E8188", fg: "#CECFD2", muted: "#A9ABAF", subtle: "#96999E", accent: "#669DF1",
      success: "#B3DF72", warn: "#FBC828", danger: "#FD9891", epic: "#D8A0F7",
      shadow: "#030404", difficulty1: "#42A5F5", difficulty2: "#66BB6A", difficulty3: "#FFEE58", difficulty4: "#FFA726", difficulty5: "#EF5350",
    },
  },
  {
    id: "jira-hc",
    name: "Jira increased contrast",
    builtin: true,
    source: "@atlaskit/tokens 20.8.2 · atlassian-dark-increased-contrast",
    colors: {
      bg: "#1F1F21", panel: "#242528", panelDim: "#18191A", overlay: "#2B2C2F", hover: "#2B2C2F", selected: "#1C2B42",
      border: "#6B6E74", borderStrong: "#A9ABAF", fg: "#E2E3E4", muted: "#CECFD2", subtle: "#BFC1C4", accent: "#CFE1FD",
      success: "#BAF3DB", warn: "#FCE4A6", danger: "#FFD5D2", epic: "#EED7FC",
      shadow: "#030404", difficulty1: "#42A5F5", difficulty2: "#66BB6A", difficulty3: "#FFEE58", difficulty4: "#FFA726", difficulty5: "#EF5350",
    },
  },
  {
    id: "github",
    name: "GitHub Dark",
    builtin: true,
    source: "@primer/primitives 11.10.0 · dark",
    colors: {
      bg: "#0D1117", panel: "#151B23", panelDim: "#010409", overlay: "#151B23", hover: "#262C36", selected: "#192639",
      border: "#3D444D", borderStrong: "#656C76", fg: "#F0F6FC", muted: "#9198A1", subtle: "#9198A1", accent: "#4493F8",
      success: "#3FB950", warn: "#D29922", danger: "#F85149", epic: "#AB7DF8",
      // Difficulty from Primer's own scales: blue, green, attention, severe, danger.
      shadow: "#010409", difficulty1: "#4493F8", difficulty2: "#3FB950", difficulty3: "#D29922", difficulty4: "#DB6D28", difficulty5: "#F85149",
    },
  },
  {
    id: "github-dimmed",
    name: "GitHub Dark Dimmed",
    builtin: true,
    source: "@primer/primitives 11.10.0 · dark-dimmed",
    colors: {
      bg: "#212830", panel: "#262C36", panelDim: "#151B23", overlay: "#2A313C", hover: "#2F3742", selected: "#293548",
      border: "#3D444D", borderStrong: "#656C76", fg: "#D1D7E0", muted: "#9198A1", subtle: "#9198A1", accent: "#478BE6",
      success: "#57AB5A", warn: "#C69026", danger: "#E5534B", epic: "#986EE2",
      shadow: "#151B23", difficulty1: "#478BE6", difficulty2: "#57AB5A", difficulty3: "#C69026", difficulty4: "#CC6B2C", difficulty5: "#E5534B",
    },
  },
];

/** What each colour is for, written into the downloadable template. */
export const TOKEN_HELP: Record<PaletteKey, string> = {
  bg: "Page background",
  panel: "Cards, tables and other raised surfaces",
  panelDim: "Board columns and other sunken wells (usually darker than bg)",
  overlay: "Drawers, dialogs, menus",
  hover: "Hovered cards and rows",
  selected: "Selected sidebar item and rows",
  border: "Dividers and outlines",
  borderStrong: "Input outlines, scrollbars",
  fg: "Main text (aim for 4.5:1 or more against panel)",
  muted: "Secondary text (aim for 4.5:1 or more against panel)",
  subtle: "Least important text, placeholders",
  accent: "Links, primary buttons, focus (aim for 3:1 or more against panel)",
  success: "Success, done",
  warn: "Warnings",
  danger: "Errors, stalled tasks, delete buttons",
  epic: "The epic symbol and epic labels",
  shadow: "Shadows under cards and menus (drawn semi-transparent, so usually near black)",
  difficulty1: "Difficulty 1 (trivial): circle inside a circle",
  difficulty2: "Difficulty 2: triangle inside a circle",
  difficulty3: "Difficulty 3: square inside a circle",
  difficulty4: "Difficulty 4: pentagon inside a circle",
  difficulty5: "Difficulty 5 (hardest): hexagon inside a circle",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ThemeCheck {
  theme?: Theme;
  errors: string[];
  warnings: string[];
}

/** Reads an uploaded theme file. Errors block it; warnings only inform. */
export function parseTheme(text: string): ThemeCheck {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: ["The file is not valid JSON."], warnings: [] };
  }
  const obj = (raw ?? {}) as { name?: unknown; colors?: Record<string, unknown> };
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 60) : "";
  if (!name) errors.push('Missing "name".');
  if (!obj.colors || typeof obj.colors !== "object") {
    errors.push('Missing "colors" object.');
    return { errors, warnings: [] };
  }
  const colors = {} as Palette;
  const filled: string[] = [];
  for (const k of PALETTE_KEYS) {
    const v = obj.colors[k];
    if (v === undefined && LATER_KEYS.includes(k)) {
      colors[k] = DEFAULT_COLORS[k];
      filled.push(k);
    } else if (typeof v !== "string" || !HEX.test(v)) errors.push(`colors.${k} must be a colour like "#1D2125" (got ${JSON.stringify(v)}).`);
    else colors[k] = v.toUpperCase();
  }
  if (errors.length) return { errors, warnings: [] };
  const theme: Theme = { id: "custom-" + slug(name), name, colors, source: "Uploaded" };
  const warnings = checkContrast(colors);
  if (filled.length) warnings.push(`Not in the file, taken from the default theme: ${filled.join(", ")}.`);
  return { theme, errors, warnings };
}

/** Readability warnings (WCAG AA) for a set of colours. */
export function checkContrast(c: Palette): string[] {
  const w: string[] = [];
  const need = (fg: PaletteKey, bg: PaletteKey, min: number, what: string) => {
    const r = contrast(c[fg], c[bg]);
    if (r < min) w.push(`${what}: ${fg} on ${bg} is ${r.toFixed(1)}:1, below ${min}:1.`);
  };
  need("fg", "panel", 4.5, "Main text may be hard to read");
  need("fg", "bg", 4.5, "Main text on the page may be hard to read");
  need("muted", "panel", 4.5, "Secondary text may be hard to read");
  need("accent", "panel", 3, "Links and buttons may be hard to see");
  if (contrast(c.panel, c.panelDim) < 1.05) w.push("Cards and board columns are nearly the same colour, so cards won't stand out.");
  return w;
}

/** A downloadable, documented template made from a theme. */
export function themeTemplate(t: Theme): string {
  const help: Record<string, string> = {};
  for (const k of PALETTE_KEYS) help[k] = TOKEN_HELP[k];
  return JSON.stringify(
    {
      name: t.builtin ? `My ${t.name}` : t.name,
      colors: t.colors,
      _help: {
        how: "Edit the colours (#rrggbb only), keep every key, then upload in Settings → Appearance. Keys starting with _ are ignored.",
        based_on: t.source ?? t.name,
        colors: help,
      },
    },
    null,
    2,
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
}
