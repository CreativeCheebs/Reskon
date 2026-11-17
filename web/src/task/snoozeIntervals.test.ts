import { describe, expect, it } from "vitest";
import { daysUntil, intervalLabel, snoozeIntervals, snoozeMaxDays } from "./snoozeIntervals";

describe("snooze intervals", () => {
  it("uses the larger default list and cap when nothing is saved", () => {
    expect(snoozeMaxDays({})).toBe(60);
    expect(snoozeIntervals({})).toEqual([1, 2, 3, 7, 14, 30]);
  });
  it("keeps the saved order and cuts the list to the cap", () => {
    expect(snoozeIntervals({ snooze: { max_days: 20, intervals: [14, 1, 30, 3] } })).toEqual([14, 1, 3]);
  });
  it("an older setting with only a cap gets the default list up to it", () => {
    expect(snoozeIntervals({ snooze: { max_days: 30 } })).toEqual([1, 2, 3, 7, 14, 30]);
  });
  it("an empty list stays empty", () => {
    expect(snoozeIntervals({ snooze: { max_days: 30, intervals: [] } })).toEqual([]);
  });
  it("labels in words", () => {
    expect([1, 2, 7, 14, 30, 60, 10].map(intervalLabel)).toEqual(["Tomorrow", "2 days", "1 week", "2 weeks", "1 month", "2 months", "10 days"]);
  });
  it("counts days between dates across a month end", () => {
    expect(daysUntil("2026-11-17", "2026-12-01")).toBe(14);
  });
});
