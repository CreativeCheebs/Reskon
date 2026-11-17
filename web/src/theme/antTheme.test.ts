import { afterEach, describe, expect, it } from "vitest";
import { makeAntTheme } from "./antTheme";
import { applyPalette, contrast, DEFAULT_COLORS, palette } from "./palette";
import { BUILTIN_THEMES, DARK_THEME, LIGHT_THEME } from "./themes";

// A tooltip is a dark box with light text, in the light themes and the dark ones.
afterEach(() => applyPalette(DEFAULT_COLORS));

function tooltip() {
  return makeAntTheme().components?.Tooltip as { colorBgSpotlight: string; colorTextLightSolid: string };
}

describe("Tooltip colours", () => {
  it("on a light theme: the main text colour behind the page colour", () => {
    applyPalette(LIGHT_THEME.colors);
    expect(tooltip()).toEqual({ colorBgSpotlight: palette.fg, colorTextLightSolid: palette.bg });
    expect(contrast(tooltip().colorBgSpotlight, "#000000")).toBeLessThan(contrast(tooltip().colorBgSpotlight, "#ffffff"));
  });

  it("on a dark theme: the overlay colour with the main text colour", () => {
    applyPalette(DARK_THEME.colors);
    expect(tooltip()).toEqual({ colorBgSpotlight: palette.overlay, colorTextLightSolid: palette.fg });
    expect(contrast(tooltip().colorBgSpotlight, "#000000")).toBeLessThan(contrast(tooltip().colorBgSpotlight, "#ffffff"));
  });

  it("every built-in theme gets a tooltip darker than its text", () => {
    for (const t of BUILTIN_THEMES) {
      applyPalette(t.colors);
      const { colorBgSpotlight: bg, colorTextLightSolid: text } = tooltip();
      expect(contrast(bg, "#000000"), t.name).toBeLessThan(contrast(text, "#000000"));
    }
  });
});
