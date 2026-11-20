import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";

// Moving a task into a done status in the task panel opens the "What's
// next?" box under the title (SPEC 4.17); a cancelled status does not.
// Whether a status is done comes from the server's answer, never its name.
const task = { id: 5, key: "PER-5", title: "Write it", type: "task", description: null, area_id: 7, status_id: 1, priority_id: null, energy_type_id: null, difficulty: null, epic_id: null, updated_at: "t1", tag_ids: [], behaviour: "todo", missing: [], blocked: false, snoozed: false, tags: [] } as unknown as Task;
const get = vi.fn(async (_p: string): Promise<unknown> => task);
const behaviours: Record<number, string> = { 1: "todo", 3: "done", 4: "cancelled" };
const post = vi.fn(async (_p: string, b?: unknown): Promise<unknown> => {
  const status_id = (b as { status_id: number }).status_id;
  return { ...task, status_id, behaviour: behaviours[status_id], updated_at: "t2" };
});
const patchFn = vi.fn(async (_p: string, _b?: unknown): Promise<unknown> => ({ ...task, epic_id: 99, updated_at: "t2" }));
vi.mock("../api", () => ({
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b), patch: (p: string, b?: unknown) => patchFn(p, b) },
  ApiError: class extends Error {},
  patchWithRetry: (p: string, seen: string, c: Record<string, unknown>) => patchFn(p, { ...c, updated_at: seen }),
}));
vi.mock("../store", () => ({ useApp: () => ({ online: true, reloadKey: 0, boot: { statuses: [{ id: 1, name: "To do" }, { id: 3, name: "Done" }, { id: 4, name: "Cancelled" }], areas: [], priorities: [], energy_types: [], settings: {} } }) }));
vi.mock("../tags/tags", () => ({ useTags: () => ({ namesOf: () => [], refreshIfNew: () => undefined }) }));
vi.mock("../tags/TagSelect", () => ({ TagSelect: () => null }));
vi.mock("./useEpics", () => ({ useEpics: () => ({ epics: [], byId: new Map(), refresh: vi.fn() }) }));
vi.mock("../offline", () => ({ WriteButton: (p: { children?: React.ReactNode }) => <button>{p.children}</button> }));
const error = vi.fn();
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: (m: string) => error(m), info: vi.fn() } }));
vi.mock("./deleteTask", () => ({ deleteTaskAsking: vi.fn() }));
for (const [file, names] of [
  ["./DifficultySlider", ["DifficultySlider"]],
  ["./EpicTasks", ["EpicTasks"]],
  ["./Subtasks", ["ParentField", "Subtasks"]],
  ["./Dependencies", ["Dependencies"]],
  ["./TaskExtras", ["TaskExtras"]],
  ["./TimeBar", ["TimeBar"]],
  ["./SnoozeButton", ["SnoozeButton"]],
] as const)
  vi.doMock(file, () => Object.fromEntries(names.map((n) => [n, () => null])));
const { TaskPanel } = await import("./TaskPanel");


const moveTo = async (name: string) => {
  const box = (await screen.findAllByRole("combobox")).find((c) => c.closest(".ant-select")?.textContent === "To do") as HTMLElement;
  fireEvent.mouseDown(box);
  fireEvent.click(await screen.findByTitle(name));
};

describe("What's next? after a move in the task panel", () => {
  beforeEach(() => {
    post.mockClear();
  });

  it("opens after a move into a done status", async () => {
    render(<TaskPanel taskId={5} initial={task} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    expect(screen.queryByRole("region", { name: "What's next?" })).toBeNull();
    await moveTo("Done");
    expect(await screen.findByRole("region", { name: "What's next?" })).toBeInTheDocument();
    expect(post.mock.calls[0][0]).toBe("/tasks/5/move");
  });

  it("stays shut after a move into a cancelled status", async () => {
    render(<TaskPanel taskId={5} initial={task} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    await moveTo("Cancelled");
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "What's next?" })).toBeNull();
  });

  it("asking again after a task was made opens a fresh box", async () => {
    render(<TaskPanel taskId={5} initial={task} openNext={{ mode: "continue" }} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    fireEvent.change(await screen.findByLabelText("Next task title"), { target: { value: "After" } });
    fireEvent.click(screen.getByRole("button", { name: "Create next task" }));
    expect(await screen.findByText(/Made/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(await screen.findByText("Continue with a new task…"));
    expect(await screen.findByLabelText("Next task title")).toHaveValue("");
    expect(screen.queryByText(/Made/)).toBeNull();
  });

  it("opens with the asked-for form when the caller asks", async () => {
    render(<TaskPanel taskId={5} initial={task} openNext={{ mode: "round" }} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    expect(await screen.findByRole("region", { name: "What's next?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start next round" })).toBeInTheDocument();
  });
});
