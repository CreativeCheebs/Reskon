import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

const calls: string[] = [];
let rows: (dates: string[]) => unknown[] = () => [];
vi.mock("../api", () => ({
  api: {
    get: async (path: string) => {
      calls.push(path);
      return rows(path.match(/dates=([^&]*)/)![1].split(","));
    },
    post: vi.fn(),
  },
}));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings: {} } }) }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn() } }));

import { SnoozeField } from "./SnoozeField";
import { daysFromToday, formatWakeDate } from "./SnoozeForecast";

let last: string | null = null;
function Harness() {
  const [v, setV] = useState<string | null>(null);
  last = v;
  return <SnoozeField value={v} onChange={setV} />;
}

describe("the new-task Snooze until field", () => {
  beforeEach(() => {
    calls.length = 0;
    last = null;
    rows = (dates) => dates.map((date) => ({ date, hours: 5, points: 11 }));
  });
  afterEach(cleanup);

  it("starts as Not snoozed, so a task made without touching it is not snoozed", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Snooze until" }).textContent).toBe("Not snoozed");
    expect(last).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("opens the snooze list with hours and points, and choosing one fills the date, the hint and the clear button", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze until" }));
    await waitFor(() => expect(screen.getAllByText("5h").length).toBeGreaterThan(0));
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(calls[0]).toContain("exclude=0");

    fireEvent.click(screen.getByRole("button", { name: /^1 week,/ }));
    const want = daysFromToday(7);
    expect(last).toBe(want);
    expect(screen.getByRole("button", { name: "Snooze until" }).textContent).toBe(`${formatWakeDate(want)} · 1 week`);
    expect(screen.getByText(/Hidden until then\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Also back that day: 5h · 11 points/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Don't snooze" }));
    expect(last).toBeNull();
    expect(screen.getByRole("button", { name: "Snooze until" }).textContent).toBe("Not snoozed");
  });

  it("leaves out the 'also back' part when nothing comes back that day", async () => {
    rows = (dates) => dates.map((date) => ({ date, hours: 0, points: 0 }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze until" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Tomorrow,/ }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(1));
    expect(screen.getByText("Hidden until then.")).toBeTruthy();
    expect(screen.queryByText(/Also back/)).toBeNull();
  });
});
