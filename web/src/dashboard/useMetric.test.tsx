import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MetricResult } from "./types";

vi.mock("../store", () => ({ useApp: () => ({ reloadKey: 0 }) }));

const pending = new Map<string, { resolve: (r: MetricResult) => void; signal?: AbortSignal }>();
vi.mock("../api", () => ({
  api: {
    get: (path: string, opts?: { signal?: AbortSignal }) =>
      new Promise<MetricResult>((resolve) => pending.set(path, { resolve, signal: opts?.signal })),
  },
}));

const { useMetric } = await import("./WidgetFrame");

const answer = (total: number): MetricResult => ({ metric: "", unit: "", group: "", from: "", to: "", points: [], series: [], reduce: "sum", total });

describe("useMetric", () => {
  it("calls an older request off, and never lets its late answer replace a newer one", async () => {
    const { result, rerender } = renderHook(({ path }) => useMetric(path), { initialProps: { path: "/a" } });
    await waitFor(() => expect(pending.has("/a")).toBe(true));
    rerender({ path: "/b" });
    await waitFor(() => expect(pending.has("/b")).toBe(true));
    expect(pending.get("/a")!.signal?.aborted).toBe(true);
    await act(async () => pending.get("/b")!.resolve(answer(2)));
    await act(async () => pending.get("/a")!.resolve(answer(1)));
    expect(result.current.res?.total).toBe(2);
    expect(result.current.forPath).toBe("/b");
    expect(result.current.loading).toBe(false);
  });

  it("does nothing on Refresh while a load runs", async () => {
    pending.clear();
    const { result } = renderHook(() => useMetric("/c"));
    await waitFor(() => expect(pending.has("/c")).toBe(true));
    const first = pending.get("/c")!;
    act(() => result.current.reload());
    expect(pending.get("/c")).toBe(first);
    expect(first.signal?.aborted).toBe(false);
  });

  it("refetch during a load runs exactly one more, never showing an answer from before the change", async () => {
    pending.clear();
    const { result } = renderHook(() => useMetric("/d"));
    await waitFor(() => expect(pending.has("/d")).toBe(true));
    await act(async () => pending.get("/d")!.resolve(answer(1)));
    // Data changed: ask again; the old answer stays while it loads.
    act(() => result.current.refetch());
    const second = pending.get("/d")!;
    expect(result.current.res?.total).toBe(1);
    // Changed again, several times, mid-load: nothing is called off.
    act(() => result.current.refetch());
    act(() => result.current.refetch());
    expect(second.signal?.aborted).toBe(false);
    expect(pending.get("/d")).toBe(second);
    // Its answer was asked before those changes: not shown, one more load instead.
    await act(async () => second.resolve(answer(2)));
    expect(result.current.res?.total).toBe(1);
    const third = pending.get("/d")!;
    expect(third).not.toBe(second);
    expect(result.current.loading).toBe(true);
    await act(async () => third.resolve(answer(3)));
    expect(result.current.res?.total).toBe(3);
    expect(result.current.loading).toBe(false);
    expect(pending.get("/d")).toBe(third);
  });
});
