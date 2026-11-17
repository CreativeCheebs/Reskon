import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";

// What the next call to the server does: answer with rows, never answer, or fail.
let reply: "pending" | "fail" | unknown[] = [];
const calls: string[] = [];
const get = async (path: string): Promise<unknown> => {
  calls.push(path);
  if (reply === "pending") return new Promise(() => {});
  if (reply === "fail") throw new Error("down");
  return reply;
};
vi.mock("../api", () => ({ api: { get: (path: string) => get(path), post: vi.fn() } }));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings: {} } }) }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn() } }));

import { SnoozeButton } from "./SnoozeButton";
import { daysFromToday, forecastLabel, forecastSentence } from "./SnoozeForecast";
import { snoozeIntervals } from "./snoozeIntervals";

const quickDays = (_max: number) => snoozeIntervals({});

const task = { id: 5, behaviour: "todo", snoozed: false, blocked: false, snooze_until_unblocked: false } as unknown as Task;

// Dates are the user's local days counted from today.
const askedDates = () => (calls[0]).match(/dates=([^&]*)/)![1].split(",");

describe("the snooze menu's forecast", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(cleanup);

  it("asks for the quick choices' dates, leaving out the task, and shows hours, points and dashes", async () => {
    const dates = quickDays(30).map(daysFromToday);
    reply = dates.map((date, i) => ({ date, hours: i === 0 ? 3 : i === 1 ? 1.5 : 0, points: i === 0 ? 7 : i === 1 ? 4.25 : 0 }));
    render(<SnoozeButton task={task} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));

    await waitFor(() => expect(screen.getByText("3h")).toBeTruthy());
    expect(calls[0]).toContain("exclude=5");
    expect(askedDates()).toEqual(dates);
    expect(screen.getByText("Snooze until")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("Points")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("1.5h")).toBeTruthy();
    expect(screen.getByText("4.3")).toBeTruthy(); // one decimal at most
    // The other three choices have nothing coming back: a dash in each column.
    expect(screen.getAllByText("–")).toHaveLength((quickDays(30).length - 2) * 2);
    // Each choice has its name and its date under it.
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText("1 month")).toBeTruthy();
  });

  it("shows the choices without numbers while loading, and they still snooze", () => {
    reply = "pending";
    render(<SnoozeButton task={task} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.queryByText("–")).toBeNull();
    expect(document.querySelectorAll(".jb-snooze-row")).toHaveLength(quickDays(30).length);
  });

  it("shows no numbers and no dashes when the forecast fails", async () => {
    reply = "fail";
    render(<SnoozeButton task={task} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() => expect(calls.length > 0).toBe(true));
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.queryByText("–")).toBeNull();
    expect(screen.queryByText(/^[0-9.]+h$/)).toBeNull();
  });

  it("says what comes back on a picked date", () => {
    const d = "2026-12-07";
    const ready = (hours: number, points: number) => ({ status: "ready" as const, days: { [d]: { date: d, hours, points } } });
    expect(forecastSentence(ready(2, 5), d)).toMatch(/: 2h, 5 pts$/);
    expect(forecastSentence(ready(0, 0), d)).toMatch(/: nothing coming back$/);
    expect(forecastSentence({ status: "loading", days: {} }, d)).not.toContain(":");
    expect(forecastSentence({ status: "error", days: {} }, d)).not.toContain(":");
  });

  it("gives each choice a spoken label with its date and what comes back", () => {
    const d = daysFromToday(1);
    const ready = (hours: number, points: number) => ({ status: "ready" as const, days: { [d]: { date: d, hours, points } } });
    expect(forecastLabel(1, ready(2, 5))).toMatch(/^Tomorrow, .+, 2h and 5 points coming back$/);
    expect(forecastLabel(1, ready(0, 0))).toMatch(/^Tomorrow, .+, nothing coming back$/);
    expect(forecastLabel(1, { status: "loading", days: {} })).not.toContain("coming back");
  });

  it("is a plain group of buttons, each with its label", async () => {
    reply = [];
    render(<SnoozeButton task={task} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    const group = screen.getByRole("group", { name: "Snooze until" });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Tomorrow, .*nothing coming back$/ })).toBeTruthy());
    expect(group.querySelectorAll("button").length).toBe(quickDays(30).length);
  });
});
