import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";

// A board widget inside its frame: a view that is gone, a reload that
// fails after cards were already drawn, and the cards' quick actions.
const views = [{ id: 7, name: "Work", filter: {}, board_state: {} }];
const statuses = [{ id: 2, name: "Doing", category_id: 2, color: null, on_board: true, alert_after_days: null, is_builtin: false, position: 1 }];
vi.mock("../store", () => ({
  useApp: () => ({ online: true, reloadKey: 0, boot: { views, statuses, priorities: [], settings: {} }, behaviourOf: () => "in_progress" }),
}));
// The card's quick actions have their own tests (ViewBoardBody.test.tsx); here they are stubs.
vi.mock("../board/CardActions", () => ({
  useCardActions: () => ({ pinned: false }),
  CardContextMenu: ({ children }: { children: React.ReactNode }) => children,
  CardActionRail: () => <div role="toolbar" aria-label="Card actions" />,
}));
vi.mock("../board/TaskCard", () => ({
  TaskCard: ({ task, rail }: { task: Task; rail?: React.ReactNode }) => (
    <div>
      {task.title}
      {rail}
    </div>
  ),
}));
vi.mock("../task/TaskPanel", () => ({ TaskPanel: () => null }));
const answers: (Task[] | Error)[] = [];
const get = vi.fn(async () => {
  const a = answers.shift()!;
  if (a instanceof Error) throw a;
  return a;
});
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => (get as (...a: unknown[]) => unknown)(...a) } }));
const { WidgetFrame } = await import("./WidgetFrame");

const widget = (view_id: number) => ({ id: 1, dashboard_id: 1, title: null, source: "view" as const, viz: "board" as never, query: { view_id } as never, options: {}, x: 0, y: 0, w: 8, h: 7, position: 0 });
const task = { id: 1, title: "Task 1", status_id: 2, board_pos: 1, snoozed: false, blocked: false, created_at: "2026-01-01" } as unknown as Task;

describe("a board widget in its frame", () => {
  it("says its view is gone, with Edit but no Refresh or Retry, and asks the server for nothing", () => {
    render(<WidgetFrame widget={widget(99)} editing onEdit={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("This view is not available any more");
    expect(screen.queryByRole("button", { name: "Refresh widget" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit widget" })).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps its cards when a later reload fails, with a small note and Retry", async () => {
    answers.push([task], new Error("The server cannot be reached."));
    render(<WidgetFrame widget={widget(7)} editing={false} />);
    await waitFor(() => expect(screen.getByText("Task 1")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Open view Work" }).getAttribute("href")).toBe("#/view/7");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh widget" })));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not refresh: The server cannot be reached."));
    expect(screen.getByText("Task 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("gives its cards the board's quick actions, except while the layout is edited", async () => {
    answers.push([task]);
    const { unmount } = render(<WidgetFrame widget={widget(7)} editing={false} />);
    await waitFor(() => expect(screen.getByText("Task 1")).toBeTruthy());
    expect(screen.getByRole("toolbar", { name: "Card actions" })).toBeTruthy();
    unmount();
    answers.push([task]);
    render(<WidgetFrame widget={widget(7)} editing onEdit={() => undefined} />);
    await waitFor(() => expect(screen.getByText("Task 1")).toBeTruthy());
    expect(screen.queryByRole("toolbar", { name: "Card actions" })).toBeNull();
  });

  it("turns Open view off while the layout is edited", () => {
    answers.push([task]);
    render(<WidgetFrame widget={widget(7)} editing onEdit={() => undefined} />);
    const open = screen.getByRole("button", { name: "Open view Work" });
    expect(open.hasAttribute("disabled") || open.getAttribute("aria-disabled") === "true").toBe(true);
  });
});
