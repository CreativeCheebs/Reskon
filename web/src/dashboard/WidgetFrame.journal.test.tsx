import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Journal } from "../journal/types";

// A journal widget in its frame: its days, each with the server's totals,
// times only when a session has them, notes kept line for line as plain
// text, no task key, the dashboard's dates noted, and a reload that fails
// leaving the days on screen.
let reloadKey = 0;
vi.mock("../store", () => ({ useApp: () => ({ online: true, reloadKey, boot: { views: [], statuses: [], priorities: [] } }) }));
vi.mock("../task/TaskPanel", () => ({ TaskPanel: ({ taskId }: { taskId: number }) => <div role="dialog">task panel {taskId}</div> }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
const answers: (Journal | Error)[] = [];
const get = vi.fn(async (_path: string) => {
  const a = answers.shift()!;
  if (a instanceof Error) throw a;
  return a;
});
vi.mock("../api", () => ({ api: { get: (p: string) => get(p) } }));
const { WidgetFrame } = await import("./WidgetFrame");

const widget = { id: 4, dashboard_id: 1, title: null, source: "journal" as const, viz: "journal" as never, query: { range: "7d" } as never, options: {}, x: 0, y: 0, w: 6, h: 9, position: 0 };
const journal = (over: Partial<Journal> = {}): Journal => ({
  from: "2026-11-09",
  to: "2026-11-15",
  more: false,
  days: [
    {
      day: "2026-11-15",
      hours: 2.25,
      points: 42,
      markdown: "## Sunday 15 November 2026 — 2h 15m, 42 points\n",
      sessions: [
        { id: 1, task_id: 9, what: "Fix backup script", area: "Home", kind: "task", start: "09:00", end: "10:30", hours: 1.5, note: "Found the cron path.\n\n<b>not bold</b>" },
        { id: 2, task_id: null, what: "Reading", area: "Learning", kind: "event", start: null, end: null, hours: 0.75, note: null },
      ],
    },
    { day: "2026-11-14", hours: 1, points: 1, markdown: "x", sessions: [{ id: 3, task_id: null, what: "Walk", area: null, kind: "event", start: null, end: null, hours: 1, note: null }] },
  ],
  ...over,
});

describe("a journal widget in its frame", () => {
  it("asks by its own id, shows each day with the server's totals, and keeps the note as plain text", async () => {
    answers.push(journal());
    render(<WidgetFrame widget={widget} editing={false} />);
    const day = await screen.findByRole("region", { name: /^Sunday 15 November/ });
    expect(get).toHaveBeenLastCalledWith("/journal?widget=4");
    expect(screen.getByText("Journal")).toBeTruthy(); // its title when it has none
    expect(day.textContent).toContain("2h 15m, 42 points");
    expect(day.textContent).toContain("09:00–10:30");
    expect(within(day).getByText("Fix backup script")).toBeTruthy();
    expect(day.textContent).toContain("(Home)");
    expect(day.textContent).toContain("1h 30m");
    // A session with no time shows none, and the line break and blank line in a note stay.
    const note = within(day).getByText(/Found the cron path/);
    expect(note.textContent).toBe("Found the cron path.\n\n<b>not bold</b>");
    expect(getComputedStyle(note).whiteSpace).toBe("pre-wrap");
    expect(day.querySelector("b")).toBeNull(); // plain text, never HTML
    // Each day is headed by its date; the list is named after the widget.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([expect.stringMatching(/^Sunday 15 November/), expect.stringMatching(/^Saturday 14 November/)]);
    expect(screen.getByRole("region", { name: "Journal" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Copy as Markdown/ })).toHaveLength(2);
    expect(screen.queryByText("showing", { exact: false })).toBeNull();
  });

  it("runs over the dashboard's dates, and says which", async () => {
    answers.push(journal());
    render(<WidgetFrame widget={widget} editing={false} dates={{ from: "2026-11-14", to: "2026-11-15" }} />);
    await screen.findByRole("region", { name: /^Sunday 15 November/ });
    expect(get).toHaveBeenLastCalledWith("/journal?widget=4&from=2026-11-14&to=2026-11-15");
    expect(screen.getByText("showing 14–15 Nov")).toBeTruthy();
  });

  it("opens the task panel from a session on a task, but not from one without", async () => {
    answers.push(journal());
    render(<WidgetFrame widget={widget} editing={false} />);
    await screen.findByText("Reading");
    expect(screen.queryByRole("button", { name: "Reading" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Fix backup script" }));
    expect(screen.getByRole("dialog").textContent).toBe("task panel 9");
  });

  it("does not open a task while the layout is edited", async () => {
    answers.push(journal());
    render(<WidgetFrame widget={widget} editing onEdit={() => undefined} />);
    await screen.findByText("Fix backup script");
    expect(screen.queryByRole("button", { name: "Fix backup script" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit widget" })).toBeTruthy();
  });

  it("keeps its days on screen while it reloads, and when the reload fails", async () => {
    answers.push(journal(), new Error("The server cannot be reached."));
    render(<WidgetFrame widget={widget} editing={false} />);
    await screen.findByText("Fix backup script");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh widget" })));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not refresh: The server cannot be reached."));
    expect(screen.getByText("Fix backup script")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("reloads when the data changes, without blanking", async () => {
    answers.push(journal(), journal({ days: [{ ...journal().days[0], hours: 3 }] }));
    const { rerender } = render(<WidgetFrame widget={widget} editing={false} />);
    await screen.findByText("Fix backup script");
    reloadKey = 1;
    rerender(<WidgetFrame widget={{ ...widget }} editing={false} />);
    expect(screen.getByText("Fix backup script")).toBeTruthy(); // still there while the new answer is on its way
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Walk")).toBeNull());
    reloadKey = 0;
  });

  it("writes the year on each day when the days are not all in this year", async () => {
    const day = (d: string) => ({ ...journal().days[1], day: d, sessions: [{ ...journal().days[1].sessions[0], id: Number(d.slice(-2)) }] });
    answers.push(journal({ days: [day("2019-01-02"), day("2018-12-31")] }));
    render(<WidgetFrame widget={widget} editing={false} />);
    const heads = (await screen.findAllByRole("heading", { level: 3 })).map((h) => h.textContent);
    expect(heads).toEqual(["Wednesday 2 January 2019", "Monday 31 December 2018"]);
  });

  it("shows loading, not the old range's days, after the range is edited", async () => {
    answers.push(journal());
    const { rerender } = render(<WidgetFrame widget={widget} editing={false} />);
    await screen.findByText("Fix backup script");
    let release!: (j: Journal) => void;
    get.mockImplementationOnce(() => new Promise<Journal>((r) => (release = r)) as never);
    rerender(<WidgetFrame widget={{ ...widget, query: { range: "30d" } as never }} editing={false} />);
    await waitFor(() => expect(screen.getByRole("status", { name: "Loading widget" })).toBeTruthy());
    expect(screen.queryByText("Fix backup script")).toBeNull();
    await act(async () => release(journal({ days: [] })));
    expect(await screen.findByText("No sessions in these days.")).toBeTruthy();
  });

  it("says when older days were left out, and when there is nothing", async () => {
    answers.push(journal({ more: true }));
    const { unmount } = render(<WidgetFrame widget={widget} editing={false} />);
    const more = (await screen.findByText(/Older days are not shown here/)).textContent!;
    expect(more).toContain("2 days");
    expect(more).toContain("Move the dashboard's dates to earlier ones");
    unmount();
    answers.push(journal({ days: [] }));
    render(<WidgetFrame widget={widget} editing={false} />);
    expect(await screen.findByText("No sessions in these days.")).toBeTruthy();
  });
});
