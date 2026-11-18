import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimerStrip, type TimerHandlers } from "./TimerStrip";
import { sessionStartFor, sessionStartForDraft } from "./logSession";
import { timingOn } from "./plan";
import { useTimers } from "./useTimers";
import type { DayItem, TimerRow } from "./types";
import type { Area } from "../types";

const post = vi.fn();
const apiErr = vi.hoisted(() => ({
  ApiError: class extends Error {
    status: number;
    current?: unknown;
    constructor(status: number, current?: unknown) {
      super("x");
      this.status = status;
      this.current = current;
    }
  },
}));
vi.mock("../api", () => ({ api: { post: (...a: unknown[]) => post(...a), del: vi.fn(), get: vi.fn() }, ApiError: apiErr.ApiError }));
vi.mock("../store", () => ({ useApp: () => ({ online: true }) }));

const timer = (p: Partial<TimerRow>): TimerRow => ({ id: 1, day: "2026-11-18", kind: "task", task_id: 5, day_item_id: null, title: "Outline", started_at: "", resumed_at: "", accumulated_s: 0, elapsed_s: 125, running: true, stopped: false, draft: null, ...p });
const handlers = (p: Partial<TimerHandlers> = {}): TimerHandlers => ({ onPause: vi.fn(), onResume: vi.fn(), onStop: vi.fn(), onReview: vi.fn(), onDiscard: vi.fn(), ...p });

describe("TimerStrip", () => {
  it("shows the server's elapsed time and offers pause and stop", async () => {
    const h = handlers();
    render(<TimerStrip list={{ timers: [timer({})], conflict: false }} fetchedAt={Date.now()} handlers={h} />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:05");
    await userEvent.click(screen.getByRole("button", { name: /Pause timer/ }));
    expect(h.onPause).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Stop timer/ }));
    expect(h.onStop).toHaveBeenCalled();
  });
  it("offers resume for a paused timer", () => {
    render(<TimerStrip list={{ timers: [timer({ running: false })], conflict: false }} fetchedAt={Date.now()} handlers={handlers()} />);
    expect(screen.getByRole("button", { name: /Resume timer/ })).toBeInTheDocument();
  });
  it("shows a stopped timer as waiting for review, with review and discard", async () => {
    const h = handlers();
    render(<TimerStrip list={{ timers: [timer({ running: false, stopped: true })], conflict: false }} fetchedAt={Date.now()} handlers={h} />);
    expect(screen.getByText(/Stopped — review/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop timer/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Review and save/ }));
    expect(h.onReview).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Discard time/ })).toBeInTheDocument();
  });
  it("disables the buttons while a call is in flight", () => {
    render(<TimerStrip list={{ timers: [timer({})], conflict: false }} fetchedAt={Date.now()} handlers={handlers({ busy: true })} />);
    expect(screen.getByRole("button", { name: /Pause timer/ })).toBeDisabled();
  });
  it("on a conflict lists every timer with a plain note, each stoppable", () => {
    render(<TimerStrip list={{ timers: [timer({}), timer({ id: 2, title: "Meeting", kind: "event" })], conflict: true }} fetchedAt={Date.now()} handlers={handlers()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Two timers ran at the same time/);
    expect(screen.getAllByRole("button", { name: /Stop timer/ })).toHaveLength(2);
  });
  it("shows nothing without timers", () => {
    const { container } = render(<TimerStrip list={{ timers: [], conflict: false }} fetchedAt={0} handlers={handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("timingOn", () => {
  const task = { id: 1, kind: "task", task_id: 5 } as DayItem;
  it("matches this day and the line, running or paused only", () => {
    expect(timingOn([timer({})], task, "2026-11-18")).toBe(true);
    expect(timingOn([timer({ running: false })], task, "2026-11-18")).toBe(true);
    expect(timingOn([timer({ day: "2026-11-17" })], task, "2026-11-18")).toBe(false);
    expect(timingOn([timer({ running: false, stopped: true })], task, "2026-11-18")).toBe(false);
    expect(timingOn([timer({ task_id: 6 })], task, "2026-11-18")).toBe(false);
    expect(timingOn([timer({ kind: "event", task_id: null, day_item_id: 9 })], { id: 9, kind: "event", task_id: null }, "2026-11-18")).toBe(true);
  });
});

describe("useTimers", () => {
  const item = { id: 1, kind: "task", task_id: 5, title: "Outline" } as DayItem;
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    return true;
  };
  it("a refused start names the running timers (not stopped ones) and remembers the start", async () => {
    post.mockReset();
    post.mockRejectedValueOnce(new apiErr.ApiError(409, { timers: [timer({ id: 3, running: false, stopped: true }), timer({ id: 4 })], conflict: false }));
    const { result } = renderHook(() => useTimers("2026-11-18", run, [], []));
    await act(async () => {
      await result.current.start(item);
    });
    expect(result.current.blocked?.map((t) => t.id)).toEqual([4]);
  });
  it("sends one start at a time", async () => {
    post.mockReset();
    let release = () => {};
    post.mockImplementation(() => new Promise<void>((r) => (release = r)));
    const { result } = renderHook(() => useTimers("2026-11-18", run, [], []));
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.start(item);
      void result.current.start(item);
    });
    await act(async () => {
      release();
      await first;
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("stop opens the draft carrying the timer id, and the wanted start is offered after", async () => {
    post.mockReset();
    post.mockRejectedValueOnce(new apiErr.ApiError(409, { timers: [timer({ id: 4 })], conflict: false }));
    post.mockResolvedValueOnce({ draft: { kind: "task", task_id: 5, logged_for: "2026-11-18", hours: 0.5, started_at: "a", ended_at: "b" } });
    const { result } = renderHook(() => useTimers("2026-11-18", run, [{ ...item, area_id: 1 } as DayItem], []));
    await act(async () => {
      await result.current.start(item);
    });
    await act(async () => {
      await result.current.stopBlocking(timer({ id: 4 }));
    });
    expect(result.current.draft?.extra).toMatchObject({ timer_id: 4, ended_at: "b" });
    act(() => result.current.finish());
    expect(result.current.draft).toBeNull();
    expect(result.current.offer?.id).toBe(1);
  });
});

describe("session starting values", () => {
  const areas = [{ id: 1, name: "Work", default_energy_type_id: 3 }, { id: 2, name: "Home", default_energy_type_id: null }] as Area[];
  const ev = (area_id: number | null) => ({ id: 9, kind: "event", task_id: null, title: "Meeting", area_id }) as DayItem;
  it("an event carries its line id and takes the area's energy type", () => {
    const s = sessionStartFor(ev(1), "2026-11-18", areas);
    expect(s.extra).toEqual({ day_item_id: 9 });
    expect(s.initial).toMatchObject({ kind: "event", label: "Meeting", energy_type_id: 3 });
  });
  it("an event with no area default leaves the energy type to choose", () => {
    expect(sessionStartFor(ev(2), "2026-11-18", areas).initial.energy_type_id).toBeNull();
    expect(sessionStartFor(ev(null), "2026-11-18", areas).initial.energy_type_id).toBeNull();
  });
  it("a timer draft keeps hours, start and end and names the timer", () => {
    const s = sessionStartForDraft({ kind: "event", day_item_id: 9, label: "Meeting", logged_for: "2026-11-18", hours: 0.5, started_at: "a", ended_at: "b" }, 4, null, 1, areas);
    expect(s.initial).toMatchObject({ hours: 0.5, started_at: "a", energy_type_id: 3 });
    expect(s.extra).toEqual({ timer_id: 4, ended_at: "b", day_item_id: 9 });
    const t = sessionStartForDraft({ kind: "task", task_id: 5, logged_for: "2026-11-18", hours: 0.02, started_at: "a", ended_at: "b" }, 4, 1, null, areas);
    expect(t.initial).toMatchObject({ task_id: 5, area_id: 1, hours: 0.02 });
  });
});
