import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimerStrip } from "./TimerStrip";
import { sessionStartFor, sessionStartForDraft } from "./logSession";
import type { DayItem, TimerRow } from "./types";
import type { Area } from "../types";

const post = vi.fn();
vi.mock("../api", () => ({ api: { post: (...a: unknown[]) => post(...a), del: vi.fn() }, ApiError: class extends Error {} }));
vi.mock("../store", () => ({ useApp: () => ({ online: true }) }));

const timer = (p: Partial<TimerRow>): TimerRow => ({ id: 1, day: "2026-11-18", kind: "task", task_id: 5, day_item_id: null, title: "Outline", started_at: "", resumed_at: "", accumulated_s: 0, elapsed_s: 125, running: true, ...p });
const run = vi.fn(async (fn: () => Promise<unknown>) => {
  await fn();
  return true;
});

describe("TimerStrip", () => {
  it("shows the server's elapsed time and offers pause and stop", async () => {
    const stop = vi.fn();
    render(<TimerStrip list={{ timers: [timer({})], conflict: false }} fetchedAt={Date.now()} run={run} onStop={stop} />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:05");
    await userEvent.click(screen.getByRole("button", { name: /Pause timer/ }));
    expect(post).toHaveBeenCalledWith("/timers/1/pause");
    await userEvent.click(screen.getByRole("button", { name: /Stop timer/ }));
    expect(stop).toHaveBeenCalled();
  });
  it("offers resume for a paused timer", () => {
    render(<TimerStrip list={{ timers: [timer({ running: false })], conflict: false }} fetchedAt={Date.now()} run={run} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Resume timer/ })).toBeInTheDocument();
  });
  it("on a conflict lists every timer with a plain note, each stoppable", () => {
    render(<TimerStrip list={{ timers: [timer({}), timer({ id: 2, title: "Meeting", kind: "event" })], conflict: true }} fetchedAt={Date.now()} run={run} onStop={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Two timers ran at the same time/);
    expect(screen.getAllByRole("button", { name: /Stop timer/ })).toHaveLength(2);
  });
  it("shows nothing without timers", () => {
    const { container } = render(<TimerStrip list={{ timers: [], conflict: false }} fetchedAt={0} run={run} onStop={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("session starting values", () => {
  const areas = [{ id: 1, name: "Work", default_energy_type_id: 3 }, { id: 2, name: "Home", default_energy_type_id: null }] as Area[];
  const ev = (area_id: number | null) => ({ id: 9, kind: "event", task_id: null, title: "Meeting", area_id } as DayItem);
  it("an event carries its line id and takes the area's energy type", () => {
    const s = sessionStartFor(ev(1), "2026-11-18", areas);
    expect(s.extra).toEqual({ day_item_id: 9 });
    expect(s.initial).toMatchObject({ kind: "event", label: "Meeting", energy_type_id: 3 });
  });
  it("an event with no area default leaves the energy type to choose", () => {
    expect(sessionStartFor(ev(2), "2026-11-18", areas).initial.energy_type_id).toBeNull();
    expect(sessionStartFor(ev(null), "2026-11-18", areas).initial.energy_type_id).toBeNull();
  });
  it("a timer draft keeps hours, start and end", () => {
    const s = sessionStartForDraft({ kind: "event", day_item_id: 9, label: "Meeting", logged_for: "2026-11-18", hours: 0.5, started_at: "a", ended_at: "b" }, null, 1, areas);
    expect(s.initial).toMatchObject({ hours: 0.5, started_at: "a", energy_type_id: 3 });
    expect(s.extra).toEqual({ ended_at: "b", day_item_id: 9 });
    const t = sessionStartForDraft({ kind: "task", task_id: 5, logged_for: "2026-11-18", hours: 0.02, started_at: "a", ended_at: "b" }, 1, null, areas);
    expect(t.initial).toMatchObject({ task_id: 5, area_id: 1, hours: 0.02 });
  });
});
