import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";

// The card's Snooze menu shows what is already coming back each day, from
// the server, and still lists its choices while the numbers load or fail.
let reply: "pending" | "fail" | unknown[] = [];
const calls: string[] = [];
const get = async (path: string): Promise<unknown> => {
  calls.push(path);
  if (reply === "pending") return new Promise(() => {});
  if (reply === "fail") throw new Error("down");
  return reply;
};
vi.mock("../api", () => ({ api: { get: (path: string) => get(path), post: vi.fn() }, patchWithRetry: vi.fn() }));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings: {}, statuses: [] } }) }));
vi.mock("../terms", async (orig) => ({ ...(await orig<object>()), useTerms: () => ({ task: "task", tasks: "tasks" }) }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../sessions/SessionModal", () => ({ SessionModal: () => null }));

import { CardActionRail, useCardActions } from "./CardActions";
import { daysFromToday } from "../task/SnoozeForecast";
import { snoozeIntervals } from "../task/snoozeIntervals";

const quickDays = (_max: number) => snoozeIntervals({});

const task = { id: 9, title: "T", behaviour: "todo", status_id: 1, snoozed: false } as unknown as Task;

function Rail() {
  const actions = useCardActions(task, { onOpen: () => {}, onChanged: () => {}, onDeleted: () => {} });
  return <CardActionRail task={task} actions={actions} onChanged={() => {}} />;
}

describe("the card's snooze menu", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(cleanup);

  it("shows hours and points per choice once the server answers", async () => {
    reply = quickDays(30).map((n, i) => ({ date: daysFromToday(n), hours: i === 0 ? 2 : 0, points: i === 0 ? 5 : 0 }));
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() => expect(screen.getByText("2h")).toBeTruthy());
    expect(calls[0]).toContain("exclude=9");
    expect(screen.getByText("Snooze until")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getAllByText("–")).toHaveLength((quickDays(30).length - 1) * 2);
  });

  it("lists the choices with no numbers while loading", async () => {
    reply = "pending";
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() => expect(screen.getByText("Tomorrow")).toBeTruthy());
    expect(screen.queryByText("–")).toBeNull();
  });

  it("lists the choices with no numbers when the forecast fails", async () => {
    reply = "fail";
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() => expect(calls.length > 0).toBe(true));
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.queryByText("–")).toBeNull();
  });
});
