import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistViz, AppTableViz } from "./viz/Checklist";
import { AppDataNote, fetchedTime } from "./AppDataNote";
import { NumberViz } from "./viz/Simple";
import type { MetricResult } from "./types";

const base: MetricResult = { metric: "", unit: "", group: "", from: "", to: "", points: [], series: [], reduce: "sum", total: 0 };

describe("app data widgets", () => {
  it("draws a checklist read-only, saying done or not done in words", () => {
    const res = {
      ...base,
      shape: "checklist" as const,
      label: "Today",
      points: [
        { key: "meditate", label: "Meditate", value: 1, detail: "10 min" },
        { key: "walk", label: "<b>Walk</b>", value: 0 },
      ],
    };
    render(<ChecklistViz res={res} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Meditate: done");
    expect(items[0].textContent).toContain("10 min");
    // The app's text is shown as text, never as markup.
    expect(items[1].textContent).toContain("<b>Walk</b>: not done");
    expect(document.querySelector("b")).toBeNull();
    // Nothing to click: ticking happens in the app.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("list", { name: "Today" })).toBeTruthy();
  });

  it("draws an app's table with its own columns, the unit as the app wrote it in the header", () => {
    const res = {
      ...base,
      shape: "table" as const,
      table: {
        columns: [
          { key: "habit", label: "Habit" },
          { key: "longest", label: "Longest", unit: "days" },
          { key: "ok", label: "OK" },
        ],
        rows: [{ habit: "Meditate", longest: 6.25, ok: true }, { habit: "Walk", longest: null, ok: false }],
      },
    };
    render(<AppTableViz res={res} />);
    expect(screen.getAllByText("Longest (days)").length).toBeGreaterThan(0);
    const cell = screen.getByText("6.3");
    expect(cell.closest("td")?.style.textAlign).toBe("right");
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("shows a number with the app's own unit, not Reskon's", () => {
    render(<NumberViz res={{ ...base, shape: "number", unit: "hours", total: 50 }} />);
    expect(screen.getByText("50 hours")).toBeTruthy();
  });

  it("leaves out a time it cannot read", () => {
    const { container, rerender } = render(<AppDataNote res={{ ...base, fetched_at: "not a time" }} />);
    expect(container.textContent).toBe("");
    rerender(<AppDataNote res={{ ...base, fetched_at: "not a time", stale: true, stale_reason: "Habits answered HTTP 503" }} />);
    expect(screen.getByRole("status").textContent).toBe("Showing the kept copy: Habits answered HTTP 503");
  });

  it("shows when the data was fetched, and a stale copy plainly", () => {
    const at = "2026-11-12T08:30:00Z";
    const { rerender } = render(<AppDataNote res={{ ...base, fetched_at: at }} />);
    expect(screen.getByText(/^fetched /)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<AppDataNote res={{ ...base, fetched_at: at, stale: true, stale_reason: "Habits answered HTTP 503" }} />);
    expect(screen.getByRole("status").textContent).toBe(`Showing the copy from ${fetchedTime(at)}: Habits answered HTTP 503`);
  });

  it("gives today's time alone and another day's date too", () => {
    const now = new Date(2026, 10, 15, 18, 0);
    expect(fetchedTime(new Date(2026, 10, 15, 9, 5).toISOString(), now)).not.toMatch(/Nov/);
    expect(fetchedTime(new Date(2026, 10, 12, 9, 5).toISOString(), now)).toMatch(/12/);
  });
});
