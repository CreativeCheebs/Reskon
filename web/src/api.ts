// Thin fetch wrapper. The server is the source of truth: every call goes
// straight to it, nothing is queued, and a network failure flips the app to
// offline (read-only) until /api/health answers again.

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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
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
    throw new ApiError(res.status, data.error ?? "error", data.detail ?? "", data.current);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
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
    if (e instanceof ApiError && e.status === 409 && e.current) {
      const cur = e.current as T;
      return await api.patch<T>(path, { ...changes, updated_at: cur.updated_at });
    }
    throw e;
  }
}
