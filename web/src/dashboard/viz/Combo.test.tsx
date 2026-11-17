import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import type { MetricResult } from "../types";

// jsdom has no layout, so the responsive wrapper gets a fixed size.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children, { width: 600, height: 300 } as object),
  };
});
const { ComboViz } = await import("./Combo");

const answer: MetricResult = {
  metric: "points_and_hours",
  unit: "mixed",
  group: "day",
  from: "2026-11-01",
  to: "2026-11-02",
  series: [
    { key: "points", label: "Points", color: null, total: 30, unit: "points", average: 15 },
    { key: "hours", label: "Hours", color: null, total: 5, unit: "hours", average: 2.5 },
  ],
  points: [
    { key: "2026-11-01", label: "2026-11-01", value: 10, split: "points" },
    { key: "2026-11-01", label: "2026-11-01", value: 2, split: "hours" },
    { key: "2026-11-02", label: "2026-11-02", value: 20, split: "points" },
    { key: "2026-11-02", label: "2026-11-02", value: 3, split: "hours" },
  ],
  reduce: "sum",
  total: 0,
};

describe("combined chart (points and hours)", () => {
  it("draws bars for the first series and a line for the second, on two Y axes", () => {
    const { container } = render(<ComboViz res={answer} options={{}} narrow={false} />);
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(2);
    expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-yAxis").length).toBe(2);
  });

  it("labels each value in its own series' unit, and draws an average per series", () => {
    const { container } = render(<ComboViz res={answer} options={{ show_values: true, show_average: true }} narrow={false} />);
    const labels = [...container.querySelectorAll(".recharts-label-list text")].map((n) => n.textContent);
    expect(labels).toEqual(["10", "20", "2h", "3h"]);
    const avg = [...container.querySelectorAll(".recharts-reference-line")].map((n) => n.textContent);
    expect(avg.some((t) => t?.includes("avg 15"))).toBe(true);
    expect(avg.some((t) => t?.includes("avg 2.5h"))).toBe(true);
  });

  it("uses the colours picked for each series", () => {
    const { container } = render(<ComboViz res={answer} options={{ series_colors: { points: "#AA5500", hours: "#0055AA" } }} narrow={false} />);
    expect(container.querySelector('path[fill="#AA5500"]')).not.toBeNull();
    expect(container.querySelector('path[stroke="#0055AA"]')).not.toBeNull();
  });

  it("narrow, shows each measure's own total and never one summed figure", () => {
    render(<ComboViz res={answer} options={{}} narrow />);
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("5h")).toBeTruthy();
    expect(screen.queryByText("35")).toBeNull();
  });
});
