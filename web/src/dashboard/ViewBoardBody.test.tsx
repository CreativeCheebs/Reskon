import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Behaviour, Status, Task, View } from "../types";
import { CARDS_PER_COLUMN, openColumns } from "./boardColumns";

// Statuses are told apart by their category's behaviour, never by name: one
// named "Done" sits in a to-do category (it shows) and one named "Shipped"
// is a done category (it does not).
const status = (id: number, name: string, position: number, on_board = true): Status => ({ id, name, category_id: id, color: null, on_board, alert_after_days: null, is_builtin: false, position });
const statuses = [
  status(1, "Backlog", 0, false),
  status(2, "Doing", 2),
  status(3, "Done", 1),
  status(4, "Shipped", 3),
  status(5, "Dropped", 4),
];
const behaviours: Record<number, Behaviour> = { 1: "todo", 2: "in_progress", 3: "todo", 4: "done", 5: "cancelled" };
const behaviourOf = (id: number) => behaviours[id];
const boot = { statuses, priorities: [] };

const task = (id: number, status_id: number, extra: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, status_id, board_pos: id, snoozed: false, blocked: false, created_at: "2026-01-01", ...extra }) as unknown as Task;
const view = (extra: Partial<View> = {}): View => ({ id: 7, name: "Work", filter: {}, board_state: {}, ...extra }) as unknown as View;

describe("openColumns", () => {
  it("makes columns from open behaviours only, in board order, by behaviour and not by name", () => {
    const cols = openColumns(view(), [task(1, 2), task(2, 3), task(3, 4), task(4, 5), task(5, 1)], boot, behaviourOf);
    // "Done" (to do) comes before "Doing" by position; Shipped, Dropped and the off-board Backlog never show.
    expect(cols.map((c) => c.status.name)).toEqual(["Done", "Doing"]);
    expect(cols.map((c) => c.count)).toEqual([1, 1]);
  });

  it("keeps to the statuses the view itself narrows to", () => {
    const cols = openColumns(view({ filter: { statuses: [2] } }), [task(1, 2), task(2, 3)], boot, behaviourOf);
    expect(cols.map((c) => c.status.id)).toEqual([2]);
  });

  it("hides snoozed tasks, and blocked ones unless the view shows them", () => {
    const tasks = [task(1, 2), task(2, 2, { snoozed: true }), task(3, 2, { blocked: true })];
    expect(openColumns(view(), tasks, boot, behaviourOf)[1].count).toBe(1);
    expect(openColumns(view({ board_state: { hide_blocked: false } }), tasks, boot, behaviourOf)[1].count).toBe(2);
  });

  it("counts every card but draws only the first page, in the view's card order", () => {
    const many = Array.from({ length: CARDS_PER_COLUMN + 5 }, (_, i) => task(i + 1, 2, { board_pos: 100 - i }));
    const col = openColumns(view(), many, boot, behaviourOf)[1];
    expect(col.count).toBe(CARDS_PER_COLUMN + 5);
    expect(col.shown).toHaveLength(CARDS_PER_COLUMN);
    expect(col.shown[0].id).toBe(CARDS_PER_COLUMN + 5); // lowest board_pos first
  });
});

vi.mock("../store", () => ({ useApp: () => ({ boot, behaviourOf }) }));
vi.mock("../terms", () => ({ useTerms: () => ({ tasks: "tasks", countTasks: (n: number) => `${n} tasks` }) }));
vi.mock("../board/TaskCard", () => ({
  TaskCard: ({ task, onOpen }: { task: Task; onOpen?: () => void }) => (
    <div role="presentation" data-testid="card" onClick={onOpen}>
      {task.title}
    </div>
  ),
}));
vi.mock("../task/TaskPanel", () => ({
  TaskPanel: ({ taskId, onClose, onChanged }: { taskId: number; onClose: () => void; onChanged: (t: unknown) => void }) => (
    <div role="dialog">
      panel {taskId}
      <button onClick={() => onChanged({})}>change it</button>
      <button onClick={onClose}>close it</button>
    </div>
  ),
}));
const { ViewBoardBody } = await import("./ViewBoardBody");

describe("ViewBoardBody", () => {
  const tasks = [task(1, 2), ...Array.from({ length: 22 }, (_, i) => task(10 + i, 3))];

  it("draws open columns with counts, a +N more link to the view, and no done column", () => {
    render(<ViewBoardBody view={view()} tasks={[...tasks, task(99, 4)]} editing={false} refetch={() => undefined} />);
    expect(screen.getByRole("group", { name: "Doing, 1 tasks" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Done, 22 tasks" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: /Shipped/ })).toBeNull();
    expect(screen.queryByText("Task 99")).toBeNull();
    expect(screen.getAllByTestId("card")).toHaveLength(1 + CARDS_PER_COLUMN);
    const more = screen.getByText("+2 more");
    expect(more.getAttribute("href")).toBe("#/view/7");
    expect(more.getAttribute("aria-label")).toBe("2 more in Done, open the view");
  });

  it("opens the task panel from a click", () => {
    render(<ViewBoardBody view={view()} tasks={tasks} editing={false} refetch={() => undefined} />);
    fireEvent.click(screen.getByText("Task 1"));
    expect(screen.getByRole("dialog").textContent).toContain("panel 1");
  });

  it("opens the task panel from the keyboard too", () => {
    render(<ViewBoardBody view={view()} tasks={tasks} editing={false} refetch={() => undefined} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens the task panel from Space too", () => {
    render(<ViewBoardBody view={view()} tasks={tasks} editing={false} refetch={() => undefined} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: " " });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("asks again after the panel closes only if something was changed in it", () => {
    const refetch = vi.fn();
    render(<ViewBoardBody view={view()} tasks={tasks} editing={false} refetch={refetch} />);
    fireEvent.click(screen.getByText("Task 1"));
    fireEvent.click(screen.getByText("close it"));
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Task 1"));
    fireEvent.click(screen.getByText("change it"));
    expect(refetch).not.toHaveBeenCalled(); // not before it closes
    fireEvent.click(screen.getByText("close it"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the panel open when a reload leaves nothing in the columns", () => {
    const { rerender } = render(<ViewBoardBody view={view()} tasks={tasks} editing={false} refetch={() => undefined} />);
    fireEvent.click(screen.getByText("Task 1"));
    rerender(<ViewBoardBody view={view()} tasks={[task(1, 4)]} editing={false} refetch={() => undefined} />);
    expect(screen.getByText("Nothing open in this view.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("turns +N more into plain text while the layout is edited", () => {
    render(<ViewBoardBody view={view()} tasks={tasks} editing refetch={() => undefined} />);
    expect(screen.getByText("+2 more").getAttribute("href")).toBeNull();
  });

  it("does not open anything while the dashboard is being edited", () => {
    render(<ViewBoardBody view={view()} tasks={tasks} editing refetch={() => undefined} />);
    fireEvent.click(screen.getByText("Task 1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when nothing is open", () => {
    render(<ViewBoardBody view={view()} tasks={[task(1, 4)]} editing={false} refetch={() => undefined} />);
    expect(screen.getByText("Nothing open in this view.")).toBeTruthy();
  });
});
