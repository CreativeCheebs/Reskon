import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { View } from "../types";

const post = vi.fn();
const boot = {
  settings: {},
  areas: [
    { id: 1, name: "Work" },
    { id: 2, name: "Home" },
  ],
  statuses: [
    { id: 10, name: "To do", on_board: true },
    { id: 11, name: "Backlog", on_board: false },
    { id: 12, name: "Done", on_board: true },
  ],
  priorities: [],
  energy_types: [],
};
const behaviours: Record<number, string> = { 10: "todo", 11: "todo", 12: "done" };
vi.mock("../api", () => ({ api: { get: vi.fn().mockResolvedValue([]), post: (...a: unknown[]) => post(...a) } }));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot, behaviourOf: (id: number) => behaviours[id] }) }));
vi.mock("../task/useEpics", () => ({ useEpics: () => ({ epics: [], byId: new Map(), refresh: vi.fn() }) }));
vi.mock("../tags/tags", async (orig) => ({
  ...(await orig<object>()),
  useTags: () => ({ tags: [], refreshIfNew: vi.fn() }),
}));
vi.mock("../task/SnoozeField", () => ({ SnoozeField: () => <button aria-label="Snooze until">Not snoozed</button> }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn() } }));

import { AddTaskModal } from "./AddTaskModal";

const view = { id: 1, filter: { areas: [2] } } as unknown as View;
const created = { id: 99, title: "Buy milk" };
const enter = { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 };

function open(statusId: number, defaults: Record<string, unknown> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<AddTaskModal statusId={statusId} view={view} defaults={defaults} onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

describe("the column's New task pop-up", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue(created);
  });
  afterEach(cleanup);

  it("puts the cursor in Title", async () => {
    open(10);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("What needs doing?")));
  });

  it("creates on Enter with the column's status and leaves unchosen fields out", async () => {
    const { onCreated, onClose } = open(10);
    const title = screen.getByPlaceholderText("What needs doing?");
    fireEvent.change(title, { target: { value: "  Buy milk " } });
    fireEvent.keyDown(title, enter);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/tasks");
    expect(body).toMatchObject({ title: "Buy milk", area_id: 2, status_id: 10, type: "task", difficulty: null, estimate_h: null, due_at: null });
    for (const k of ["priority_id", "energy_type_id", "epic_id", "snooze_until", "tags"]) expect(k in body).toBe(false);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("sends a lane's value and reads the estimate", async () => {
    open(10, { priority_id: 5 });
    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), { target: { value: "X" } });
    const est = screen.getByPlaceholderText("e.g. 2h");
    fireEvent.change(est, { target: { value: "1h 30m" } });
    fireEvent.keyDown(est, enter);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toMatchObject({ priority_id: 5, estimate_h: 1.5 });
  });

  it("does nothing on Enter with an empty title", () => {
    open(10);
    fireEvent.keyDown(screen.getByPlaceholderText("What needs doing?"), enter);
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps the text and shows the error when the server refuses", async () => {
    post.mockRejectedValue(new Error("Area is full"));
    const { onClose } = open(10);
    const title = screen.getByPlaceholderText("What needs doing?");
    fireEvent.change(title, { target: { value: "Keep me" } });
    fireEvent.keyDown(title, enter);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Area is full"));
    expect((title as HTMLInputElement).value).toBe("Keep me");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc", () => {
    const { onClose } = open(10);
    fireEvent.keyDown(screen.getByPlaceholderText("What needs doing?"), { key: "Escape", code: "Escape", keyCode: 27 });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Snooze until for a to-do column and hides it for a Done one", () => {
    open(10);
    expect(screen.getByRole("button", { name: "Snooze until" })).toBeTruthy();
    cleanup();
    open(12);
    expect(screen.queryByRole("button", { name: "Snooze until" })).toBeNull();
  });
});
