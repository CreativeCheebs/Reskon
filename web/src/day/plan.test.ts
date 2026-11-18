import { describe, expect, it } from "vitest";
import { availableText, clock, elapsedNow, loggedOfEstimate, minutesText, parseMinutes, readAvailable, reorderIds, rowFigures, stepIds, unestimatedText } from "./plan";
import type { DayItem, PlanTotals } from "./types";

const totals = (p: Partial<PlanTotals>): PlanTotals => ({ planned_min: 0, logged_min: 0, unestimated: 0, available_min: null, available_from: null, over: false, ...p });

describe("planner wording", () => {
  it("words minutes", () => {
    expect(minutesText(90)).toBe("1h 30m");
    expect(minutesText(45)).toBe("45m");
    expect(minutesText(null)).toBe("–");
  });
  it("says not set when there is no available time", () => {
    expect(availableText(totals({}))).toBe("Available time not set");
    expect(availableText(totals({ available_min: 480, available_from: "day" }))).toContain("set for this day");
    expect(availableText(totals({ available_min: 240, available_from: "weekday" }))).toContain("from the weekday");
  });
  it("counts tasks with no estimate", () => {
    expect(unestimatedText(0)).toBe("");
    expect(unestimatedText(1)).toBe("1 task has no estimate");
    expect(unestimatedText(3)).toBe("3 tasks have no estimate");
  });
  it("shows a task as all-time logged over its estimate, an event as reserved", () => {
    expect(loggedOfEstimate({ logged_h: 0.75, estimate_h: 3 })).toBe("45m / 3h");
    expect(loggedOfEstimate({ logged_h: 1, estimate_h: null })).toBe("1h / no estimate");
    expect(rowFigures({ kind: "event", planned_min: 30 } as DayItem)).toBe("30m reserved");
  });
});

describe("timer clock", () => {
  it("formats", () => {
    expect(clock(5)).toBe("00:05");
    expect(clock(725)).toBe("12:05");
    expect(clock(3723)).toBe("1:02:03");
  });
  it("ticks only while running", () => {
    expect(elapsedNow({ elapsed_s: 60, running: true }, 1000, 11000)).toBe(70);
    expect(elapsedNow({ elapsed_s: 60, running: false }, 1000, 11000)).toBe(60);
    expect(elapsedNow({ elapsed_s: 60, running: true }, 5000, 1000)).toBe(60);
  });
});

describe("ordering", () => {
  it("places an id before another or last", () => {
    expect(reorderIds([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(reorderIds([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
    expect(reorderIds([1, 2, 3], 2, 99)).toEqual([1, 3, 2]);
  });
  it("steps one place", () => {
    expect(stepIds([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(stepIds([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(stepIds([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
});

describe("settings and input", () => {
  it("reads only weekdays that are set", () => {
    expect(readAvailable({ mon: 480, tue: "x", foo: 1 })).toEqual({ mon: 480 });
    expect(readAvailable(undefined)).toEqual({});
  });
  it("parses minutes", () => {
    expect(parseMinutes("90")).toBe(90);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("2h")).toBe(120);
    expect(parseMinutes("1:15")).toBe(75);
    expect(parseMinutes("45m")).toBe(45);
    expect(parseMinutes("0")).toBeNull();
    expect(parseMinutes("abc")).toBeNull();
    expect(parseMinutes("")).toBeNull();
  });
});
