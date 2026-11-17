import { describe, expect, it, vi } from "vitest";
import { CUSTOM_RANGE, rangeChoice, withDates, withRangeChoice } from "./customRange";

vi.mock("../api", () => ({ api: {} }));
vi.mock("../store", () => ({ useApp: () => ({}) }));
const { metricPath } = await import("./WidgetEditor");

describe("a chart widget's custom period", () => {
  it("shows Custom only when the query holds both dates", () => {
    expect(rangeChoice({ metric: "points", range: "7d" })).toBe("7d");
    expect(rangeChoice({ metric: "points" })).toBe("30d");
    expect(rangeChoice({ metric: "points", from: "2026-11-01", to: "2026-11-09" })).toBe(CUSTOM_RANGE);
  });

  it("picking Custom swaps the named range for dates, and back", () => {
    const custom = withRangeChoice({ metric: "points", range: "7d" }, CUSTOM_RANGE, "2026-11-17");
    expect(custom).toEqual({ metric: "points", from: "2026-11-11", to: "2026-11-17" });
    const back = withRangeChoice(custom, "90d", "2026-11-17");
    expect(back).toEqual({ metric: "points", range: "90d" });
  });

  it("keeps picked dates in order", () => {
    expect(withDates({ metric: "points", range: "7d" }, "2026-11-09", "2026-11-01")).toEqual({
      metric: "points",
      from: "2026-11-01",
      to: "2026-11-09",
    });
  });

  it("asks the server for the dates, not a range", () => {
    const path = metricPath({ metric: "points", group: "day", from: "2026-11-01", to: "2026-11-09" }, "bar");
    expect(path).toContain("from=2026-11-01");
    expect(path).toContain("to=2026-11-09");
    expect(path).not.toContain("range=");
  });
});
