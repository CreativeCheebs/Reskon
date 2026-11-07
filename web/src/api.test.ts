import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, isOnline, patchWithRetry } from "./api";

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => reply(200, { ok: true })));
    expect(await api.get("/health")).toEqual({ ok: true });
  });

  it("turns an error reply into an ApiError, keeping the 409 'current' row", async () => {
    const current = { id: 7, updated_at: "2026-11-01T10:00:00Z" };
    vi.stubGlobal("fetch", vi.fn(() => reply(409, { error: "conflict", detail: "changed elsewhere", current })));
    const err = (await api.patch("/tasks/7", { title: "x" }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.current).toEqual(current);
  });

  it("goes offline when the server cannot be reached, and back online on the next reply", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("network"))));
    const err = (await api.get("/tasks").catch((e) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(isOnline()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(() => reply(200, {})));
    await api.get("/health");
    expect(isOnline()).toBe(true);
  });

  it("announces a sign-out when a data call answers 401, but not a sign-in call", async () => {
    const seen = vi.fn();
    window.addEventListener("jitterbug:signed-out", seen);
    vi.stubGlobal("fetch", vi.fn(() => reply(401, { error: "unauthorized" })));
    await api.get("/tasks").catch(() => {});
    expect(seen).toHaveBeenCalledTimes(1);
    await api.post("/auth/login", {}).catch(() => {});
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener("jitterbug:signed-out", seen);
  });

  it("says the HTTP status when a proxy answers with something that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 }))));
    const err = (await api.get("/tasks").catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/502/);
  });
});

describe("patchWithRetry", () => {
  it("retries once with the fresh updated_at when the row changed", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string));
        return calls.length === 1
          ? reply(409, { error: "conflict", detail: "changed", current: { id: 1, updated_at: "NEW" } })
          : reply(200, { id: 1, updated_at: "NEWER" });
      }),
    );
    await patchWithRetry("/tasks/1", "OLD", { title: "x" });
    expect(calls).toEqual([
      { title: "x", updated_at: "OLD" },
      { title: "x", updated_at: "NEW" },
    ]);
  });

  it("does not retry when the 409 is about something else and carries no updated_at", async () => {
    const fetchSpy = vi.fn(() => reply(409, { error: "conflict", detail: "this epic still has tasks", current: { used_by: "3 tasks" } }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(patchWithRetry("/tasks/1", "OLD", { title: "x" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
