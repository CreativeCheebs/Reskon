// Live updates: the server sends a short note each time your data changes
// (in another tab, on the phone, from a plugin), and the app reloads what it
// shows. Notes carry no data; the reload goes through the normal API.

/** This tab's name, sent with every request so its own changes are not echoed back. */
export const tabId: string = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("-");

export interface LiveNote {
  topic: string;
  tab?: string;
  /** With topic "app_data": which connected app's data changed (its id, e.g. "habits"). */
  app?: string;
}

/** A tab hidden or frozen for longer than this has an untrustworthy connection. */
const STALE_MS = 30_000;
/** How often the tab checks that its own clock did not jump (a sleeping laptop). */
const WATCH_MS = 5_000;

/**
 * Opens the live connection and keeps it open: it reconnects after a drop
 * (waiting longer each time, up to 30 s) and then calls onNote once with
 * topic "reconnect", because notes sent while it was down were missed.
 *
 * A connection can also die without the browser noticing (a laptop that
 * slept, wifi that changed): the socket then still looks open and never
 * reports a drop. So the connection is replaced on purpose, at once, when the
 * network comes back, when the tab becomes visible after more than 30 s away,
 * and when the tab's own timers show it was frozen. The replacement reports
 * "reconnect", so what is on screen reloads once.
 *
 * Notes about this tab's own changes are skipped. Returns a stop function.
 */
export function startLive(onNote: (n: LiveNote) => void, onRefused?: () => void): () => void {
  let ws: WebSocket | null = null;
  let isOpen = false;
  let stopped = false;
  let wait = 1000;
  let timer: number | undefined;
  let connectedBefore = false;
  let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
  let lastTick = Date.now();

  const open = () => {
    if (stopped) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${scheme}://${location.host}/api/live`);
    ws = sock;
    isOpen = false;
    let opened = false;
    sock.onopen = () => {
      opened = true;
      isOpen = true;
      wait = 1000;
      if (connectedBefore) onNote({ topic: "reconnect" });
      connectedBefore = true;
    };
    sock.onmessage = (ev) => {
      try {
        const n = JSON.parse(String(ev.data)) as LiveNote;
        if (n.tab !== tabId) onNote(n);
      } catch {
        // Not a note; ignore it.
      }
    };
    sock.onclose = (ev) => {
      ws = null;
      isOpen = false;
      if (stopped) return;
      // 1008: the server closed it because this tab is signed out. Trying
      // again would only be refused; the app shows the sign-in page.
      if (ev.code === 1008) {
        stopped = true;
        window.dispatchEvent(new Event("jitterbug:signed-out"));
        return;
      }
      // Refused before it opened (the browser hides a 401 here, it shows
      // as 1006): let the caller find out why. A signed-out answer ends this
      // tab's connection attempts through the app's sign-out handling.
      if (!opened) onRefused?.();
      timer = window.setTimeout(open, wait);
      wait = Math.min(wait * 2, 30_000);
    };
  };

  // Throw the current connection away (it may be dead without saying so) and
  // open a new one now.
  const recycle = () => {
    if (stopped) return;
    window.clearTimeout(timer);
    const old = ws;
    ws = null;
    isOpen = false;
    if (old) {
      old.onopen = old.onmessage = old.onclose = null;
      try {
        old.close();
      } catch {
        // Already gone.
      }
    }
    wait = 1000;
    open();
  };

  const onOnline = () => recycle();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    lastTick = Date.now();
    if (!isOpen || away > STALE_MS) recycle();
  };
  // A frozen tab runs no timers: a long gap between two ticks while the tab is
  // showing means the machine slept.
  const watch = window.setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (document.visibilityState === "visible" && gap > STALE_MS) recycle();
  }, WATCH_MS);

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearInterval(watch);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    ws?.close();
  };
}

/**
 * Turns many notes into few reloads. A note waits `delay` ms for more to
 * arrive. It also waits while the tab is hidden (nobody is looking) and
 * while a mouse button or finger is down (a card being dragged must not
 * jump), then runs once.
 */
export function reloadScheduler(reload: () => void, delay = 400) {
  let pending = false;
  let timer: number | undefined;
  let pressed = false;

  const blocked = () => document.visibilityState === "hidden" || pressed;
  const run = () => {
    timer = undefined;
    if (!pending) return;
    if (blocked()) return; // run again when unblocked
    pending = false;
    reload();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, delay);
  };
  const unblocked = () => {
    if (pending && !blocked()) schedule();
  };
  const down = () => {
    pressed = true;
  };
  const up = () => {
    pressed = false;
    unblocked();
  };

  document.addEventListener("visibilitychange", unblocked);
  // A button released outside the window sends no pointerup; leaving the
  // window counts as letting go.
  window.addEventListener("blur", up);
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  return {
    note() {
      pending = true;
      schedule();
    },
    stop() {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", unblocked);
      window.removeEventListener("blur", up);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    },
  };
}
