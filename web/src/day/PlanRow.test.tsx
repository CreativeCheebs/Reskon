import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanRow, type RowActions } from "./PlanRow";
import { Totals } from "./Totals";
import type { DayItem, PlanTotals } from "./types";

vi.mock("../store", () => ({ useApp: () => ({ boot: { areas: [{ id: 1, name: "Work" }] }, online: true }) }));

const item = (p: Partial<DayItem>): DayItem => ({
  id: 1, day: "2026-11-18", kind: "task", task_id: 5, title: "Write outline", area_id: 1, position: 1, planned_min: null, task_title: "Write outline", renamed: false,
  estimate_h: 3, logged_h: 0.75, logged_day_h: 0.25, status_id: 2, status_behaviour: "todo", done: false, session_count: 0, created_at: "", updated_at: "", ...p,
});
const actions = (p: Partial<RowActions> = {}): RowActions => ({ onLog: vi.fn(), onReschedule: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onStep: vi.fn(), onDropBefore: vi.fn(), ...p });

describe("PlanRow", () => {
  it("shows the day's figure apart from the task's all-time logged / estimate", () => {
    render(<ul><PlanRow item={item({ planned_min: 120 })} first last actions={actions()} /></ul>);
    expect(screen.getByText("45m / 3h")).toBeInTheDocument();
    expect(screen.getByText("15m of 2h today")).toBeInTheDocument();
  });
  it("a renamed line shows its own name and the task it is part of, and opens the task", async () => {
    const open = vi.fn();
    render(<ul><PlanRow item={item({ title: "Outline part 1", renamed: true })} first last actions={actions({ onOpenTask: open })} /></ul>);
    expect(screen.getByText(/Part of: Write outline/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open task Write outline" }));
    expect(open).toHaveBeenCalledWith(5);
  });
  it("an event is marked done by its checkbox", async () => {
    const toggle = vi.fn();
    render(<ul><PlanRow item={item({ kind: "event", task_id: null, task_title: null, planned_min: 30, title: "Meeting" })} first last actions={actions({ onToggleDone: toggle })} /></ul>);
    await userEvent.click(screen.getByRole("checkbox", { name: "Mark done: Meeting" }));
    expect(toggle).toHaveBeenCalled();
  });
  it("shows an event's reserved minutes and a done task as done", () => {
    render(<ul><PlanRow item={item({ kind: "event", task_id: null, planned_min: 30, title: "Meeting", done: false })} first last actions={actions()} /><PlanRow item={item({ id: 2, done: true })} first last actions={actions()} /></ul>);
    expect(screen.getByText("30m reserved")).toBeInTheDocument();
    expect(screen.getByLabelText("Done")).toBeInTheDocument();
  });
  it("logs from the Log button", async () => {
    const a = actions();
    render(<ul><PlanRow item={item({})} first last actions={a} /></ul>);
    await userEvent.click(screen.getByLabelText("Log a session for Write outline"));
    expect(a.onLog).toHaveBeenCalled();
  });
});

describe("Totals", () => {
  const t = (p: Partial<PlanTotals>): PlanTotals => ({ planned_min: 300, logged_min: 60, unestimated: 0, available_min: null, available_from: null, over: false, ...p });
  it("does not warn when available time is not set", () => {
    render(<Totals totals={t({})} />);
    expect(screen.getByText("Available time not set")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("warns when over", () => {
    render(<Totals totals={t({ available_min: 240, available_from: "day", over: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/more than available/);
  });
});
