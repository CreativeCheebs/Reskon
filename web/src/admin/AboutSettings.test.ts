import { describe, expect, it } from "vitest";
import { updatedLabel } from "./AboutSettings";

describe("updatedLabel", () => {
  it("turns the server's day into a short readable date", () => {
    const s = updatedLabel("2026-11-13") ?? "";
    expect(s).toContain("13");
    expect(s).toContain("2026");
  });
  it("shows nothing when the server gave no day or a bad one", () => {
    expect(updatedLabel(undefined)).toBeNull();
    expect(updatedLabel("")).toBeNull();
    expect(updatedLabel("yesterday")).toBeNull();
  });
});
