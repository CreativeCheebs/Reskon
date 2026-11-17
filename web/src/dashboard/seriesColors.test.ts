import { describe, expect, it } from "vitest";
import { seriesColors } from "./format";

describe("seriesColors", () => {
  const series = [
    { key: "1", color: "#111111" },
    { key: "2", color: null },
    { key: "3", color: "#333333" },
  ];

  it("uses the colour picked for a series over its own", () => {
    const got = seriesColors(series, { "1": "#ABCDEF", "2": "#123456" });
    expect(got[0]).toBe("#ABCDEF");
    expect(got[1]).toBe("#123456");
    expect(got[2]).toBe("#333333");
  });

  it("ignores a picked colour that is not #rrggbb, and keeps the series' own", () => {
    expect(seriesColors(series, { "1": "red" })[0]).toBe("#111111");
  });

  it("is unchanged when nothing was picked", () => {
    expect(seriesColors(series)).toEqual(seriesColors(series, {}));
  });
});
