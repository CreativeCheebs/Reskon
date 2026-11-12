import { describe, expect, it } from "vitest";
import { cleanTag, cleanTags, MAX_TAG_LENGTH, MAX_TAGS, tagProblem } from "./tags";

describe("tags", () => {
  it("tidies a typed tag", () => {
    expect(cleanTag("  #Back   end ")).toBe("Back end");
    expect(cleanTag("##x")).toBe("x");
    expect(cleanTag("   ")).toBe("");
  });
  it("says why a tag would be refused", () => {
    expect(tagProblem("")).toMatch(/name/);
    expect(tagProblem("a,b")).toMatch(/comma/);
    expect(tagProblem("x".repeat(MAX_TAG_LENGTH + 1))).toMatch(/at most/);
    expect(tagProblem("x".repeat(MAX_TAG_LENGTH))).toBeNull();
  });
  it("keeps each tag once, ignoring capitals, and drops the unusable", () => {
    expect(cleanTags(["Backend", "backend", " #ui ", "", "a,b"])).toEqual(["Backend", "ui"]);
  });
  it("keeps at most 20", () => {
    expect(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });
});
