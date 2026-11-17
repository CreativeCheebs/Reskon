import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Settings > Snooze: "Longest snooze" saves when the box is left (or Enter),
// not on every keystroke; and it follows the stored setting if that changes.
let settings: Record<string, unknown> = { snooze: { max_days: 90, intervals: [1, 7] } };
const saveSetting = vi.fn(async (_k: string, _v: unknown) => undefined);
vi.mock("../store", () => ({ useApp: () => ({ online: true, saveSetting, boot: { settings } }) }));
vi.mock("../theme/feedback", () => ({ autosave: (p: Promise<unknown>) => p }));
vi.mock("../terms", async (orig) => {
  const mod = await orig<typeof import("../terms")>();
  return { ...mod, useTerms: () => mod.makeTerms(mod.DEFAULT_TERMS) };
});
const { SnoozeSettings } = await import("./SnoozeSettings");

describe("Longest snooze", () => {
  it("saves once, on blur, with the typed number", () => {
    saveSetting.mockClear();
    render(<SnoozeSettings />);
    const box = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "3" } });
    fireEvent.change(box, { target: { value: "30" } });
    expect(saveSetting).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(saveSetting).toHaveBeenCalledTimes(1);
    expect(saveSetting).toHaveBeenCalledWith("snooze", { max_days: 30, intervals: [1, 7] });
  });

  it("follows the stored setting when it changes elsewhere", () => {
    settings = { snooze: { max_days: 90, intervals: [1, 7] } };
    const { rerender } = render(<SnoozeSettings />);
    settings = { snooze: { max_days: 60, intervals: [1, 7, 14] } };
    rerender(<SnoozeSettings />);
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("60");
    expect(screen.getByText(/2 weeks/)).toBeTruthy();
  });
});
