// "My data changed" from a connected app (docs/plugins.md section 7). Two
// ways in: the app's page inside a widget posts "changed" to this page, or
// the server sends a live note (topic "app_data") because the app's server
// called Reskon, or another tab heard from the page. Either way only that
// app's data widgets fetch again; nothing else reloads, and the app's page
// widgets are never reloaded (that would wipe what the person is doing
// inside them, and spend a sign-in ticket).

import { api } from "../api";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
/** Per app: the waiting timer and when the first "changed" of this burst came. */
const waiting = new Map<string, { timer: number; since: number }>();
const tell = new Set<string>();

/** How long a burst of "changed" waits for more before data is fetched once. */
export const CHANGED_DELAY = 300;
/** The longest a steady stream of "changed" waits: it still fetches this often. */
export const CHANGED_MAX_WAIT = 1500;

/** Calls fn (after a short wait that folds bursts together) each time the
 *  app's data changed. Returns a function that stops it. */
export function onAppChanged(app: string, fn: Listener): () => void {
  let set = listeners.get(app);
  if (!set) {
    set = new Set();
    listeners.set(app, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(app);
  };
}

function flush(app: string) {
  waiting.delete(app);
  if (tell.delete(app)) {
    // A failed note only means other tabs refresh later (on their own
    // Refresh, or when the dashboard is opened again).
    api.post(`/apps/${encodeURIComponent(app)}/changed`).catch(() => undefined);
  }
  listeners.get(app)?.forEach((fn) => fn());
}

/**
 * Says the app's data changed. Runs on the trailing edge: the widgets fetch
 * once, after the last "changed" of a burst, so the fetch sees the newest
 * data; under a steady stream, at least every CHANGED_MAX_WAIT ms.
 * tellOthers (from the app's page in this tab) also tells the person's
 * other tabs, through the server; a note from the server does not go back.
 */
export function appChanged(app: string, tellOthers: boolean) {
  if (tellOthers) tell.add(app);
  const now = Date.now();
  const w = waiting.get(app);
  if (w) window.clearTimeout(w.timer);
  const since = w?.since ?? now;
  const delay = Math.max(0, Math.min(CHANGED_DELAY, since + CHANGED_MAX_WAIT - now));
  waiting.set(app, { timer: window.setTimeout(() => flush(app), delay), since });
}

/** Drops anything waiting (signed out, or the app closed). */
export function resetAppChanged() {
  waiting.forEach((w) => window.clearTimeout(w.timer));
  waiting.clear();
  tell.clear();
}
