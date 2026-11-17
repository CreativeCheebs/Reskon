import { describe, expect, it } from "vitest";
import { blend, contrast, readable } from "./palette";

// Label text must be readable on its own faint tint in light and dark themes.
describe("readable", () => {
  it("lightens a dim colour on a dark surface", () => {
    const bg = blend("#6B778C", "#1d1d21", 0.16);
    expect(contrast(readable("#6B778C", bg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens a pale colour on a light surface (yellow priority on white)", () => {
    const bg = blend("#F5CD47", "#ffffff", 0.16);
    const c = readable("#F5CD47", bg);
    expect(contrast(c, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, "#000000")).toBeLessThan(contrast("#F5CD47", "#000000"));
  });

  it("leaves a colour that already reads alone", () => {
    expect(readable("#101010", "#ffffff")).toBe("#101010");
    expect(readable("#f0f0f0", "#101010")).toBe("#f0f0f0");
  });
});
