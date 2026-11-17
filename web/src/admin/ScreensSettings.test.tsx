import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Settings › Screens: the Dashboard toolbar position choice shows what is
// saved (top when nothing is) and saves "left" or "top" as it is changed.
let settings: Record<string, unknown> = {};
const saveSetting = vi.fn(async () => undefined);
vi.mock("../store", () => ({ useApp: () => ({ online: true, saveSetting, boot: { settings } }) }));
vi.mock("../theme/feedback", () => ({ autosave: (p: Promise<unknown>) => p }));
const { ScreensSettings } = await import("./ScreensSettings");

describe("Dashboard toolbar position", () => {
  it("starts on Top, and saves Left", () => {
    render(<ScreensSettings />);
    expect(screen.getByText("Dashboard toolbar position")).toBeTruthy();
    const top = screen.getByRole("radio", { name: "Top" }) as HTMLInputElement;
    expect(top.checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Left" }));
    expect(saveSetting).toHaveBeenCalledWith("dashboard_toolbar", "left");
  });

  it("shows a saved Left", () => {
    settings = { dashboard_toolbar: "left" };
    render(<ScreensSettings />);
    expect((screen.getByRole("radio", { name: "Left" }) as HTMLInputElement).checked).toBe(true);
  });
});
