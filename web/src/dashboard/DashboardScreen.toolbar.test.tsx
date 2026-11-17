import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The dashboard has no big title (its name is the chosen tab), and its
// toolbar sits at the top unless the `dashboard_toolbar` setting says left.
let settings: Record<string, unknown> = {};
vi.mock("../store", () => ({ useApp: () => ({ online: true, reloadKey: 0, boot: { settings, views: [] } }) }));
vi.mock("../api", () => ({
  api: { get: async () => [{ id: 1, name: "Home", position: 0, widgets: [{ id: 1, dashboard_id: 1, title: "A", source: "metric", viz: "number", query: {}, options: {}, x: 0, y: 0, w: 4, h: 3, position: 0 }] }] },
}));
vi.mock("../theme/feedback", () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("../offline", () => ({ WriteButton: (p: { children?: React.ReactNode }) => <button>{p.children}</button> }));
vi.mock("./WidgetFrame", () => ({ WidgetFrame: () => <div>a widget</div> }));
vi.mock("./WidgetEditor", () => ({ WidgetEditor: () => null }));
const { DashboardScreen } = await import("./DashboardScreen");

const toolbar = () => document.querySelector(".jb-dashboard-toolbar") as HTMLElement;

describe("the dashboard toolbar", () => {
  beforeEach(() => {
    settings = {};
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
  });

  it("has no big title, and sits at the top by default", async () => {
    render(<DashboardScreen id={1} onOpen={() => undefined} />);
    await screen.findByText("a widget");
    expect(document.querySelector("h1")).toBeNull();
    expect(screen.getByText("Home")).toBeTruthy(); // the dashboard's name is its tab
    expect(toolbar().dataset.position).toBe("top");
    expect(toolbar().style.flexDirection).not.toBe("column");
  });

  it("goes down the left side when the setting says left", async () => {
    settings = { dashboard_toolbar: "left" };
    render(<DashboardScreen id={1} onOpen={() => undefined} />);
    await screen.findByText("a widget");
    expect(toolbar().dataset.position).toBe("left");
    expect(toolbar().style.flexDirection).toBe("column");
  });

  it("treats any other value as top, and stays on top on a phone-sized window", async () => {
    settings = { dashboard_toolbar: "sideways" };
    const { unmount } = render(<DashboardScreen id={1} onOpen={() => undefined} />);
    await screen.findByText("a widget");
    expect(toolbar().dataset.position).toBe("top");
    unmount();
    settings = { dashboard_toolbar: "left" };
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    render(<DashboardScreen id={1} onOpen={() => undefined} />);
    await screen.findByText("a widget");
    expect(toolbar().dataset.position).toBe("top");
  });

  it("falls back to the top below 1000px, and the Edit button says whether it is pressed", async () => {
    settings = { dashboard_toolbar: "left" };
    Object.defineProperty(window, "innerWidth", { value: 900, configurable: true });
    render(<DashboardScreen id={1} onOpen={() => undefined} />);
    await screen.findByText("a widget");
    expect(toolbar().dataset.position).toBe("top");
    const edit = screen.getByRole("button", { name: /Edit/ });
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(edit);
    expect(screen.getByRole("button", { name: /Done/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
