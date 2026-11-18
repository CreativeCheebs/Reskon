import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BringForward } from "./BringForward";

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));
vi.mock("../store", () => ({ useApp: () => ({ boot: { areas: [{ id: 1, name: "Work" }] }, online: true }) }));

describe("BringForward", () => {
  it("asks only when opened, then copies the picked tasks", async () => {
    get.mockResolvedValue([{ task_id: 7, title: "Reply to supplier", area_id: 1, estimate_h: 0.25, logged_h: 0, from_day: "2026-11-17", days: 1 }]);
    const run = vi.fn(async (fn: () => Promise<unknown>) => {
      await fn();
      return true;
    });
    render(<BringForward day="2026-11-18" run={run} />);
    expect(get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Unfinished from earlier days/ }));
    await userEvent.click(await screen.findByLabelText(/Reply to supplier/));
    await userEvent.click(screen.getByRole("button", { name: /Bring 1 to this day/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/day/2026-11-18/bring-forward", { task_ids: [7] }));
    expect(get).toHaveBeenCalledWith("/day/2026-11-18/bring-forward");
  });
});
