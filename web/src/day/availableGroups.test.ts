import { describe, expect, it } from "vitest";
import { groupAvailable } from "./availableGroups";
import type { Behaviour, Status, Task } from "../types";

const st = (id: number, position: number): Status => ({ id, name: `S${id}`, category_id: id, color: null, on_board: true, alert_after_days: null, is_builtin: false, position });
const task = (id: number, status_id: number, p: Partial<Task> = {}): Task => ({ id, status_id, title: `Task ${id}`, key: `K-${id}`, type: "task", ...p }) as Task;
const beh = (id: number): Behaviour => (id === 3 ? "done" : id === 2 ? "in_progress" : "todo");

describe("groupAvailable", () => {
  const statuses = [st(2, 2), st(1, 1), st(3, 3)];
  it("groups open statuses in board order and leaves done ones out", () => {
    const g = groupAvailable([task(1, 1), task(2, 2), task(3, 3)], statuses, beh, new Set());
    expect(g.map((x) => x.status.id)).toEqual([1, 2]);
    expect(g[0].tasks.map((t) => t.id)).toEqual([1]);
  });
  it("leaves out planned tasks and epics, keeps empty groups", () => {
    const g = groupAvailable([task(1, 1), task(2, 1), task(4, 1, { type: "epic" })], statuses, beh, new Set([1]));
    expect(g[0].tasks.map((t) => t.id)).toEqual([2]);
    expect(g[1].tasks).toEqual([]);
  });
  it("filters by title or key", () => {
    const g = groupAvailable([task(1, 1, { title: "Reply to supplier" }), task(2, 1)], statuses, beh, new Set(), "supp");
    expect(g[0].tasks.map((t) => t.id)).toEqual([1]);
  });
});
