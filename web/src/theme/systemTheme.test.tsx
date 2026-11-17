import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { AppPageBody } from "../dashboard/AppPageBody";
import type { Widget } from "../dashboard/types";
import { palette } from "./palette";
import { checkContrast, DARK_THEME, LIGHT_THEME, parseTheme, resolveTheme, SYSTEM_THEME } from "./themes";

// A stand-in for the browser's light/dark setting that a test can flip.
let dark = true;
let listeners: Array<(e: { matches: boolean }) => void> = [];
function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return q.includes("dark") ? dark : !dark;
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => (listeners = listeners.filter((l) => l !== fn)),
  }));
}
function osSwitch(toDark: boolean) {
  dark = toDark;
  act(() => listeners.forEach((l) => l({ matches: toDark })));
}

beforeEach(() => {
  dark = true;
  listeners = [];
  localStorage.clear();
  stubMatchMedia();
});
afterEach(() => vi.unstubAllGlobals());

function Probe() {
  const { theme, choice } = useTheme();
  return <div data-testid="p">{`${choice.id}>${theme.id}`}</div>;
}

describe("light, dark and system themes", () => {
  it("resolves System to Dark or Light and leaves other choices alone", () => {
    expect(resolveTheme(SYSTEM_THEME, true)).toBe(DARK_THEME);
    expect(resolveTheme(SYSTEM_THEME, false)).toBe(LIGHT_THEME);
    expect(resolveTheme(LIGHT_THEME, true)).toBe(LIGHT_THEME);
    expect(resolveTheme(DARK_THEME, false)).toBe(DARK_THEME);
  });

  it("the light theme is readable and a valid theme file", () => {
    expect(checkContrast(LIGHT_THEME.colors)).toEqual([]);
    const file = JSON.stringify({ name: "Light", colors: LIGHT_THEME.colors });
    expect(parseTheme(file).errors).toEqual([]);
  });

  it("starts on System, and follows the computer live", () => {
    render(<ThemeProvider>{() => <Probe />}</ThemeProvider>);
    expect(screen.getByTestId("p").textContent).toBe("system>default");
    expect(palette.bg).toBe(DARK_THEME.colors.bg);
    osSwitch(false);
    expect(screen.getByTestId("p").textContent).toBe("system>light");
    expect(palette.bg).toBe(LIGHT_THEME.colors.bg);
    expect(document.body.style.background).not.toBe("");
    osSwitch(true);
    expect(screen.getByTestId("p").textContent).toBe("system>default");
    expect(palette.bg).toBe(DARK_THEME.colors.bg);
  });

  it("a fixed choice ignores the computer's setting", () => {
    function Pick() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme(LIGHT_THEME)}>light</button>;
    }
    render(<ThemeProvider>{() => <><Probe /><Pick /></>}</ThemeProvider>);
    fireEvent.click(screen.getByText("light"));
    expect(screen.getByTestId("p").textContent).toBe("light>light");
    osSwitch(false);
    osSwitch(true);
    expect(screen.getByTestId("p").textContent).toBe("light>light");
    expect(palette.bg).toBe(LIGHT_THEME.colors.bg);
  });

  it("remembers System in this browser", () => {
    function Pick() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme(LIGHT_THEME)}>light</button>;
    }
    const first = render(<ThemeProvider>{() => <Pick />}</ThemeProvider>);
    fireEvent.click(screen.getByText("light"));
    first.unmount();
    render(<ThemeProvider>{() => <Probe />}</ThemeProvider>);
    expect(screen.getByTestId("p").textContent).toBe("light>light");
  });

  it("sends an app's page the new colours when the computer switches", async () => {
    const widget = { id: 7, dashboard_id: 1, title: "Habits", source: "app_page", viz: "page", query: { app: "habits", widget: "today" }, options: {}, x: 0, y: 0, w: 4, h: 4, position: 0 } as unknown as Widget;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ url: "http://habits.example:8098/w#ticket=t", origin: "http://habits.example:8098", style: "reskon", title: "Habits" })))));
    render(<ThemeProvider>{() => <AppPageBody widget={widget} loads={0} editing={false} />}</ThemeProvider>);
    const frame = (await screen.findByTitle("Habits")) as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage: post } });
    fireEvent.load(frame);
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: "theme", theme: expect.objectContaining({ mode: "dark" }) }), "http://habits.example:8098");
    osSwitch(false);
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "theme", theme: expect.objectContaining({ mode: "light", bg: LIGHT_THEME.colors.panel }) }),
      "http://habits.example:8098",
    );
  });
});
