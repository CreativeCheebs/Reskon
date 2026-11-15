// Thin fetch wrapper. The server is the source of truth: every call goes
// straight to it, nothing is queued, and a network failure flips the app to
// offline (read-only) until /api/health answers again.

import { tabId } from "./live";

export class ApiError extends Error {
  status: number;
  detail: string;
  current?: unknown; // present on 409: the row as it is now
  constructor(status: number, error: string, detail: string, current?: unknown) {
    super(detail || error);
    this.status = status;
    this.detail = detail;
    this.current = current;
  }
}

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let online = true;

export function isOnline() {
  return online;
}

export function onOnlineChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setOnline(v: boolean) {
  if (v === online) return;
  online = v;
  listeners.forEach((fn) => fn(v));
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      signal,
      // A Blob (an uploaded file) goes as it is; anything else as JSON.
      // The tab's name lets the server leave this tab out of the live note.
      headers: body === undefined || body instanceof Blob ? { "X-Reskon-Tab": tabId } : { "Content-Type": "application/json", "X-Reskon-Tab": tabId },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch (e) {
    // Called off by the caller (a newer request took its place): the server
    // is fine, so this says nothing about being online.
    if (signal?.aborted) throw e;
    setOnline(false);
    throw new ApiError(0, "offline", "The server cannot be reached.");
  }
  setOnline(true);
  const data = await res.json().catch(() => ({}));
  // Session ended (signed out elsewhere, expired, account disabled).
  if (res.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new Event("jitterbug:signed-out"));
  }
  if (!res.ok) {
    // A proxy in front of the server may answer with a page that is not JSON; then the status is all there is.
    throw new ApiError(res.status, data.error ?? "error", data.detail ?? (data.error ? "" : `The server answered HTTP ${res.status}.`), data.current);
  }
  return data as T;
}

export const api = {
  /** signal: a request the caller may call off (AbortController). */
  get: <T>(path: string, opts?: { signal?: AbortSignal }) => request<T>("GET", path, undefined, opts?.signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// Poll /api/health: every 3s while offline, every 15s while online, so a
// dead server is noticed even when the user is only reading.
export function startHealthCheck() {
  let timer: number;
  const tick = async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setOnline(res.ok);
    } catch {
      setOnline(false);
    }
    timer = window.setTimeout(tick, online ? 15000 : 3000);
  };
  window.addEventListener("offline", () => setOnline(false));
  // A failed request flips us offline; start fast polling straight away.
  onOnlineChange((v) => {
    if (!v) {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, 3000);
    }
  });
  timer = window.setTimeout(tick, 15000);
  return () => window.clearTimeout(timer);
}

/** PATCH with optimistic concurrency. On 409, reapply the same change on top
 *  of the current row once (the user's edit wins for the fields it touched). */
export async function patchWithRetry<T extends { updated_at: string }>(
  path: string,
  seen: string,
  changes: Record<string, unknown>,
): Promise<T> {
  try {
    return await api.patch<T>(path, { ...changes, updated_at: seen });
  } catch (e) {
    // Only a 409 that carries the row as it is now can be retried; other 409s
    // (an epic that still has tasks, say) carry something else.
    const cur = e instanceof ApiError && e.status === 409 ? (e.current as Partial<T> | undefined) : undefined;
    if (cur && typeof cur.updated_at === "string") {
      return await api.patch<T>(path, { ...changes, updated_at: cur.updated_at });
    }
    throw e;
  }
}
