import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";

// Creating an epic from the task panel's epic picker: one POST with the
// task's own area, then the task is linked to it; a second click while it is
// working makes no second epic; and if linking fails the person is told the
// epic exists.
const task = { id: 5, key: "PER-5", title: "Write it", type: "task", description: null, area_id: 7, status_id: 1, priority_id: null, energy_type_id: null, difficulty: null, epic_id: null, updated_at: "t1", tag_ids: [], behaviour: "todo", missing: [], blocked: false, snoozed: false, tags: [] } as unknown as Task;
const get = vi.fn(async (_p: string): Promise<unknown> => task);
const post = vi.fn(async (_p: string, _b?: unknown): Promise<unknown> => ({ id: 99, title: "New epic", type: "epic" }));
const patchFn = vi.fn(async (_p: string, _b?: unknown): Promise<unknown> => ({ ...task, epic_id: 99, updated_at: "t2" }));
vi.mock("../api", () => ({
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b), patch: (p: string, b?: unknown) => patchFn(p, b) },
  ApiError: class extends Error {},
  patchWithRetry: (p: string, seen: string, c: Record<string, unknown>) => patchFn(p, { ...c, updated_at: seen }),
}));
vi.mock("../store", () => ({ useApp: () => ({ online: true, reloadKey: 0, boot: { statuses: [], areas: [], priorities: [], energy_types: [], settings: {} } }) }));
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

const typeAndPick = async (text: string) => {
  const box = (await screen.findAllByRole("combobox")).find((c) => c.closest(".ant-select")?.textContent?.includes("No epic")) as HTMLElement;
  fireEvent.mouseDown(box);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(await screen.findByText(/Create epic/));
};

describe("create an epic from the task panel", () => {
  beforeEach(() => {
    post.mockClear();
    patchFn.mockClear();
    error.mockClear();
  });

  it("posts the epic in the task's area, and links it", async () => {
    render(<TaskPanel taskId={5} initial={task} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    await typeAndPick("New epic");
    await waitFor(() => expect(patchFn).toHaveBeenCalled());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/tasks");
    expect(post.mock.calls[0][1]).toMatchObject({ title: "New epic", type: "epic", area_id: 7 });
    expect(patchFn.mock.calls[0][1]).toMatchObject({ epic_id: 99, updated_at: "t1" });
    expect(error).not.toHaveBeenCalled();
  });

  it("says the epic was created when it could not be added to the task", async () => {
    patchFn.mockRejectedValueOnce(new Error("nope"));
    render(<TaskPanel taskId={5} initial={task} onClose={() => undefined} onChanged={() => undefined} onDeleted={() => undefined} />);
    await typeAndPick("New epic");
    await waitFor(() => expect(error).toHaveBeenCalledWith("Epic created, but it could not be added to this task."));
    expect(post).toHaveBeenCalledTimes(1);
  });
});
