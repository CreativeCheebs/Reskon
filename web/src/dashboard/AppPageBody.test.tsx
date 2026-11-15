import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AppPageBody } from "./AppPageBody";
import type { Widget } from "./types";

afterEach(() => vi.unstubAllGlobals());

const widget = {
  id: 7,
  dashboard_id: 1,
  title: "Today's habits",
  source: "app_page",
  viz: "page",
  query: { app: "habits", widget: "today" },
  options: {},
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  position: 0,
} as unknown as Widget;

function launchAnswers(url: string) {
  const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ url, origin: new URL(url).origin, style: "reskon", title: "Today's habits" }))));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("AppPageBody", () => {
  it("shows the app's page in a sandboxed frame, with the ticket and theme after #", async () => {
    const fetchSpy = launchAnswers("http://habits.example:8098/widgets/today#ticket=t1");
    render(<ThemeProvider>{() => <AppPageBody widget={widget} loads={0} editing={false} />}</ThemeProvider>);
    const frame = (await screen.findByTitle("Today's habits")) as HTMLIFrameElement;
    expect(fetchSpy).toHaveBeenCalledWith("/api/apps/launch", expect.objectContaining({ method: "POST", body: JSON.stringify({ widget: 7 }) }));
    expect(frame.getAttribute("src")).toMatch(/^http:\/\/habits\.example:8098\/widgets\/today#ticket=t1&theme=%7B/);
    const sandbox = frame.getAttribute("sandbox")!.split(" ");
    expect(sandbox).toEqual(expect.arrayContaining(["allow-scripts", "allow-forms", "allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox"]));
    expect(sandbox.some((s) => s.includes("top-navigation"))).toBe(false);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");

    // Messages go to the page's own origin only.
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage: post } });
    // Nothing is sent before the page has loaded.
    expect(post).not.toHaveBeenCalled();
    fireEvent.load(frame);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ reskon: 1, type: "theme" }), "http://habits.example:8098");
  });

  it("refuses a page on Reskon's own address", async () => {
    launchAnswers(window.location.origin + "/widgets/today");
    render(<ThemeProvider>{() => <AppPageBody widget={widget} loads={0} editing={false} />}</ThemeProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Reskon's own address");
    expect(screen.queryByTitle("Today's habits")).toBeNull();
  });

  it("refuses an address whose origin is not the one the server reported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ url: "http://evil.example/x", origin: "http://habits.example:8098", style: "reskon", title: "" })))),
    );
    render(<ThemeProvider>{() => <AppPageBody widget={widget} loads={0} editing={false} />}</ThemeProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot open");
  });

  it("launches again, with a new frame, on each Refresh", async () => {
    const fetchSpy = launchAnswers("http://habits.example:8098/widgets/today");
    const { rerender } = render(<ThemeProvider>{() => <AppPageBody widget={widget} loads={0} editing={false} />}</ThemeProvider>);
    const first = await screen.findByTitle("Today's habits");
    rerender(<ThemeProvider>{() => <AppPageBody widget={widget} loads={1} editing={false} />}</ThemeProvider>);
    const second = await screen.findByTitle("Today's habits");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});
