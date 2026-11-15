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
});
