import { describe, expect, it } from "vitest";
import { epicToCreate } from "./epicCreate";

const epics = [{ title: "STM32 demo" }, { title: "Website" }];

describe("epicToCreate", () => {
  it("offers the typed text when no epic has that title", () => {
    expect(epicToCreate("  Launch  ", epics)).toBe("Launch");
  });
  it("offers nothing for empty text", () => {
    expect(epicToCreate("   ", epics)).toBeNull();
  });
  it("offers nothing when an epic already has that title, whatever the case", () => {
    expect(epicToCreate("website", epics)).toBeNull();
  });
  it("still offers a title that only partly matches another", () => {
    expect(epicToCreate("Web", epics)).toBe("Web");
  });
});
