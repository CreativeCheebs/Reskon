import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";
import { daysFromToday } from "./SnoozeForecast";

// The "What's next?" box (SPEC 4.17): the epic question fits the task (no
// epic, in an epic, a subtask, an epic), and the request carries exactly
// what was chosen. A refused request shows the server's words and keeps
// what was typed.

const post = vi.fn(async (_p: string, _b?: unknown): Promise<unknown> => ({ id: 43, title: "Wire garage camera", round_no: null, round_kind: null }));
const get = vi.fn(async (_p: string): Promise<unknown> => ({ id: 7, title: "Install cameras" }));
vi.mock("../api", () => ({ api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) } }));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings: {} } }) }));
const house = { id: 9, title: "House", type: "epic" };
vi.mock("./useEpics", () => ({ useEpics: () => ({ epics: [house], byId: new Map([[9, house]]), refresh: vi.fn() }) }));
const { WhatsNext } = await import("./WhatsNext");

const base = { id: 42, key: "HOM-42", title: "Set up NVR", type: "task", parent_id: null, epic_id: null, area_id: 1, round_no: null, round_kind: null } as unknown as Task;
const show = (t: Partial<Task>, mode: "continue" | "round" = "continue") => {
  const onMade = vi.fn();
  render(<WhatsNext task={{ ...base, ...t }} mode={mode} onClose={() => undefined} onMade={onMade} onOpenTask={() => undefined} />);
  return onMade;
};
const typeTitle = (text: string) => fireEvent.change(screen.getByLabelText("Next task title"), { target: { value: text } });
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create next task" }));
const sent = () => post.mock.calls[0][1] as Record<string, unknown>;

describe("What's next? box", () => {
  beforeEach(() => {
    post.mockClear();
    get.mockClear();
  });

  it("no epic: an epic for both is chosen, named after the task, and editable", async () => {
    const onMade = show({});
    expect(screen.getByRole("radio", { name: /Make an epic for both/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Put both in an epic I already have/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /No epic, just link them/ })).not.toBeChecked();
    const name = screen.getByLabelText("Epic name") as HTMLInputElement;
    expect(name.value).toBe("Set up NVR");
    fireEvent.change(name, { target: { value: "NVR cameras" } });
    typeTitle("Wire garage camera");
    fireEvent.click(screen.getByRole("button", { name: "Tags" })); // leave the tags out
    create();
    await waitFor(() => expect(onMade).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe("/tasks/42/continue");
    expect(sent()).toMatchObject({ title: "Wire garage camera", copy: ["energy_type", "priority", "level"], epic: "new", epic_title: "NVR cameras", separate: false });
    expect(sent().today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText(/Made/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open it" })).toBeInTheDocument();
  });

  it("in an epic: only keep both in it (chosen) or no epic", async () => {
    show({ epic_id: 9 });
    expect(screen.getByRole("radio", { name: /Keep both in/ })).toBeChecked();
    expect(screen.getByText("House")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /New task has no epic/ })).toBeInTheDocument();
    expect(screen.queryByText(/Make an epic/)).toBeNull();
    expect(screen.queryByText(/new epic/i)).toBeNull();
    typeTitle("Next");
    create();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(sent()).toMatchObject({ epic: "same", copy: ["energy_type", "priority", "level", "tags"] });
    expect(sent()).not.toHaveProperty("epic_title");
  });

  it("a subtask: next subtask of its parent (chosen) or a separate task, no epic question", async () => {
    show({ parent_id: 7 });
    expect(await screen.findByText("Install cameras")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Next subtask of/ })).toBeChecked();
    expect(screen.queryByText(/epic/i)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /A separate task/ }));
    typeTitle("Mount back camera");
    create();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(sent()).toMatchObject({ epic: "none", separate: true });
  });

  it("an epic: no epic question and no next round", async () => {
    show({ type: "epic" } as Partial<Task>, "round");
    expect(screen.queryByText(/both/)).toBeNull();
    expect(screen.queryByText(/subtask/)).toBeNull();
    expect(screen.getByText(/the next one is an epic too/)).toBeInTheDocument();
    expect(screen.queryByText("Next round")).toBeNull();
    typeTitle("Phase 2");
    create();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(sent()).toMatchObject({ epic: "none", separate: false });
  });

  it("a refused request shows the server's words and keeps the typed title", async () => {
    post.mockRejectedValueOnce(new Error("choose an epic"));
    show({});
    typeTitle("Wire garage camera");
    create();
    expect(await screen.findByText("choose an epic")).toBeInTheDocument();
    expect((screen.getByLabelText("Next task title") as HTMLInputElement).value).toBe("Wire garage camera");
  });

  it("next round: snoozed for a week sends that local date", async () => {
    post.mockResolvedValueOnce({ id: 44, title: "Set up NVR", round_no: 2, round_kind: "version" });
    show({}, "round");
    fireEvent.click(screen.getByRole("radio", { name: "Versions v" }));
    fireEvent.click(screen.getByRole("radio", { name: "1 week" }));
    fireEvent.click(screen.getByRole("button", { name: "Start next version" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe("/tasks/42/next-round");
    expect(sent()).toMatchObject({ kind: "version", snooze_until: daysFromToday(7) });
    expect((await screen.findByText(/Made/)).textContent).toContain("Set up NVRv2");
  });
});
