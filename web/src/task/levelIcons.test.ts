import { describe, expect, it } from "vitest";
import { slantLines } from "./LevelIcons";
import { levelName } from "../types";

describe("level icon", () => {
  it("draws as many slanted lines as the level", () => {
    for (let n = 1; n <= 5; n++) expect(slantLines(n)).toHaveLength(n);
  });
  it("keeps every line inside the icon and the lines apart", () => {
    for (let n = 1; n <= 5; n++) {
      const xs = slantLines(n).flatMap((d) => [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1])));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.5);
      expect(Math.max(...xs)).toBeLessThanOrEqual(23.5);
    }
  });
  it("names a level by its number only", () => {
    expect(levelName(1)).toBe("Level 1");
    expect(levelName(5)).toBe("Level 5");
  });
});
