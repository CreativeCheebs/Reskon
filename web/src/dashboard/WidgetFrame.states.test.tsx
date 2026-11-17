import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { StateRow } from "../day/types";

// A Buffs and debuffs widget in its frame: the states in force, worst first,
// ones not in force left out, a message when there are none, and a click on a
// chip opening the Buffs and debuffs screen, except while the layout is edited.
vi.mock("../store", () => ({ useApp: () => ({ online: true, reloadKey: 0, boot: { views: [], statuses: [], priorities: [] } }) }));
const get = vi.fn(async (_path: string): Promise<StateRow[]> => []);
vi.mock("../api", () => ({ api: { get: (p: string) => get(p) } }));
const { WidgetFrame } = await import("./WidgetFrame");

const widget = { id: 6, dashboard_id: 1, title: null, source: "states" as const, viz: "states" as never, query: {} as never, options: {}, x: 0, y: 0, w: 12, h: 3, position: 0 };
const state = (id: number, name: string, severity: number, over: Partial<StateRow> = {}): StateRow => ({
  id,
  name,
  kind: "debuff",
  severity,
  started_on: "2026-11-10",
  duration_days: null,
  decay: "static",
  cleared_on: null,
  note: null,
  effective_on: "2026-11-17",
  effective_severity: severity,
  in_force: true,
  days_running: 7,
  ended: false,
  ...over,
});

describe("a Buffs and debuffs widget in its frame", () => {
  beforeEach(() => {
    get.mockReset();
    window.location.hash = "";
  });

  it("shows the states in force, worst first, under its default title", async () => {
    get.mockResolvedValue([state(1, "Headache", 1), state(2, "Flu", 4), state(3, "Old cold", 3, { in_force: false })]);
    render(<WidgetFrame widget={widget} editing={false} />);
    await screen.findByText("Flu");
    expect(get).toHaveBeenCalledWith("/states");
    expect(screen.getByText("Buffs and debuffs")).toBeTruthy();
    const names = ["Flu", "Headache"].map((n) => screen.getByText(n));
    expect(names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Old cold")).toBeNull();
    // It is not a metric: there is no "needs a newer version" message.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when nothing is in force", async () => {
    get.mockResolvedValue([]);
    render(<WidgetFrame widget={{ ...widget, title: "Feeling" }} editing={false} />);
    await screen.findByText("Nothing in force.");
    expect(screen.getByText("Feeling")).toBeTruthy();
  });

  it("opens the Buffs and debuffs screen from a chip, but not while the layout is edited", async () => {
    get.mockResolvedValue([state(2, "Flu", 4)]);
    const { unmount } = render(<WidgetFrame widget={widget} editing />);
    fireEvent.click(await screen.findByText("Flu"));
    expect(window.location.hash).toBe("");
    unmount();
    render(<WidgetFrame widget={widget} editing={false} />);
    fireEvent.click(await screen.findByText("Flu"));
    expect(window.location.hash).toBe("#/states");
  });
});
