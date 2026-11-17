import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
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
const { Chart } = await import("./Charts");

const result = (over: Partial<MetricResult> = {}): MetricResult => ({
  metric: "points",
  unit: "points",
  group: "day",
  from: "2026-11-01",
  to: "2026-11-03",
  points: [
    { key: "2026-11-01", label: "2026-11-01", value: 4 },
    { key: "2026-11-02", label: "2026-11-02", value: 0 },
    { key: "2026-11-03", label: "2026-11-03", value: 7.5 },
  ],
  series: [],
  reduce: "sum",
  total: 11.5,
  ...over,
});

describe("chart renderers", () => {
  it("writes no value labels unless asked", () => {
    const { container } = render(<Chart res={result()} viz="bar" options={{}} />);
    expect(container.querySelector(".recharts-bar-rectangle")).not.toBeNull();
    expect(container.querySelector(".recharts-label-list")).toBeNull();
  });

  it("writes each bar's value on top when show_values is on", () => {
    const { container } = render(<Chart res={result()} viz="bar" options={{ show_values: true }} />);
    const text = [...container.querySelectorAll(".recharts-label-list text")].map((n) => n.textContent);
    expect(text).toEqual(["4", "0", "7.5"]);
  });

  it("writes each line point's value when show_values is on", () => {
    const { container } = render(<Chart res={result()} viz="line" options={{ show_values: true }} />);
    expect([...container.querySelectorAll(".recharts-label-list text")].map((n) => n.textContent)).toEqual(["4", "0", "7.5"]);
  });

  it("draws a series in the colour picked for it", () => {
    const res = result({
      series: [{ key: "1", label: "Focus", color: null, total: 11.5 }],
      points: [{ key: "2026-11-01", label: "2026-11-01", value: 4, split: "1" }],
    });
    const { container } = render(<Chart res={res} viz="split_bar" options={{ series_colors: { "1": "#AA5500" } }} />);
    expect(container.querySelector('path[fill="#AA5500"]')).not.toBeNull();
  });
});
