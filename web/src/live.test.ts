import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadScheduler, startLive, tabId } from "./live";

describe("reloadScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns a burst of notes into one reload", () => {
    const reload = vi.fn();
    const s = reloadScheduler(reload, 400);
    s.note();
    s.note();
    vi.advanceTimersByTime(200);
    s.note();
    vi.advanceTimersByTime(399);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("waits while a mouse button is down (a card being dragged)", () => {
    const reload = vi.fn();
    const s = reloadScheduler(reload, 400);
    window.dispatchEvent(new Event("pointerdown"));
    s.note();
    vi.advanceTimersByTime(2000);
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("waits while the tab is hidden", () => {
    const reload = vi.fn();
    const s = reloadScheduler(reload, 400);
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    s.note();
    vi.advanceTimersByTime(2000);
    expect(reload).not.toHaveBeenCalled();
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
    vis.mockRestore();
    s.stop();
  });
});

// A stand-in WebSocket the test drives by hand.
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
}

describe("startLive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes on other tabs' notes, skips its own, and says when it reconnects", () => {
    const got: string[] = [];
    const stop = startLive((n) => got.push(n.topic));
    const first = FakeSocket.all[0];
    expect(first.url).toMatch(/^ws:\/\/.*\/api\/live$/);
    first.onopen?.();
    first.onmessage?.({ data: JSON.stringify({ topic: "tasks", tab: "another-tab" }) });
    first.onmessage?.({ data: JSON.stringify({ topic: "sessions", tab: tabId }) });
    first.onmessage?.({ data: "not json" });
    expect(got).toEqual(["tasks"]);

    // The connection drops: it tries again after a second, then reports the gap.
    first.onclose?.({ code: 1006 });
    expect(FakeSocket.all.length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all.length).toBe(2);
    FakeSocket.all[1].onopen?.();
    expect(got).toEqual(["tasks", "reconnect"]);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all.length).toBe(2); // stopped: no more tries
  });

  it("asks why when a connection is refused before it opens", () => {
    const refused = vi.fn();
    const stop = startLive(() => undefined, refused);
    FakeSocket.all[0].onclose?.({ code: 1006 }); // never opened
    expect(refused).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    FakeSocket.all[1].onopen?.();
    FakeSocket.all[1].onclose?.({ code: 1006 }); // opened, then dropped
    expect(refused).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops trying, and says so, when the server says the tab is signed out", () => {
    const signedOut = vi.fn();
    window.addEventListener("jitterbug:signed-out", signedOut);
    const stop = startLive(() => undefined);
    FakeSocket.all[0].onopen?.();
    FakeSocket.all[0].onclose?.({ code: 1008 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all.length).toBe(1);
    expect(signedOut).toHaveBeenCalledTimes(1);
    window.removeEventListener("jitterbug:signed-out", signedOut);
    stop();
  });

  it("replaces a connection that only looks open when the network comes back", () => {
    const got: string[] = [];
    const stop = startLive((n) => got.push(n.topic));
    FakeSocket.all[0].onopen?.();
    window.dispatchEvent(new Event("online"));
    expect(FakeSocket.all.length).toBe(2);
    FakeSocket.all[1].onopen?.();
    expect(got).toEqual(["reconnect"]);
    stop();
  });

  it("replaces the connection when the tab becomes visible after a long time away", () => {
    const got: string[] = [];
    const stop = startLive((n) => got.push(n.topic));
    FakeSocket.all[0].onopen?.();
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 8 * 3600_000);
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeSocket.all.length).toBe(2);
    FakeSocket.all[1].onopen?.();
    expect(got).toEqual(["reconnect"]);
    vis.mockRestore();
    stop();
  });

  it("keeps a healthy connection when the tab was away only briefly", () => {
    const stop = startLive(() => undefined);
    FakeSocket.all[0].onopen?.();
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 5_000);
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeSocket.all.length).toBe(1);
    vis.mockRestore();
    stop();
  });

  it("opens at once on becoming visible when it is waiting to retry", () => {
    const stop = startLive(() => undefined);
    FakeSocket.all[0].onclose?.({ code: 1006 });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(30_000);
      FakeSocket.all[FakeSocket.all.length - 1].onclose?.({ code: 1006 });
    }
    const before = FakeSocket.all.length;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeSocket.all.length).toBe(before + 1);
    stop();
  });

  it("replaces the connection after the machine slept while the tab was showing", () => {
    const stop = startLive(() => undefined);
    FakeSocket.all[0].onopen?.();
    vi.setSystemTime(Date.now() + 3600_000); // the clock jumped; no ticks ran meanwhile
    vi.advanceTimersByTime(5_000);
    expect(FakeSocket.all.length).toBe(2);
    stop();
  });

  it("backs off up to 30 seconds between tries", () => {
    const stop = startLive(() => undefined);
    const gaps = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const g of gaps) {
      const n = FakeSocket.all.length;
      FakeSocket.all[n - 1].onclose?.({ code: 1006 });
      vi.advanceTimersByTime(g - 1);
      expect(FakeSocket.all.length).toBe(n);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all.length).toBe(n + 1);
    }
    stop();
  });
});
