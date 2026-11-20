import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Task } from "../types";

// Continue and Start next round (SPEC 4.17) are always in the right-click
// menu, even when none of the chosen actions applies to the task; a menu
// with nothing chosen still leaves the browser's own menu. An epic has no
// next round.
let settings: Record<string, unknown> = {};
vi.mock("../api", () => ({ api: { get: vi.fn(async () => []), post: vi.fn() }, patchWithRetry: vi.fn() }));
vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings, statuses: [] } }) }));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../sessions/SessionModal", () => ({ SessionModal: () => null }));
const { useCardActions } = await import("./CardActions");

const done = { id: 9, title: "T", type: "task", behaviour: "done", status_id: 3, snoozed: false } as unknown as Task;

function Keys({ task }: { task: Task }) {
  const actions = useCardActions(task, { onOpen: () => {}, onChanged: () => {}, onDeleted: () => {} });
  return <div data-testid="keys">{actions.contextMenu.items.map((i) => String(i?.key ?? "-")).join(",")}</div>;
}

describe("Continue and Next round in the right-click menu", () => {
  it("stay when the only chosen action does not apply (Snooze on a done task)", () => {
    settings = { card_actions: { rail: [], menu: ["snooze"] } };
    render(<Keys task={done} />);
    expect(screen.getByTestId("keys").textContent).toBe("next:continue,next:round");
  });

  it("leave the browser's menu when nothing is chosen", () => {
    settings = { card_actions: { rail: [], menu: [] } };
    render(<Keys task={done} />);
    expect(screen.getByTestId("keys").textContent).toBe("");
  });

  it("offer only Continue for an epic", () => {
    settings = { card_actions: { rail: [], menu: ["open"] } };
    render(<Keys task={{ ...done, type: "epic" } as Task} />);
    expect(screen.getByTestId("keys").textContent).toBe("open,-,next:continue");
  });
});
