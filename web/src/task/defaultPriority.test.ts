import { describe, expect, it } from "vitest";
import { defaultPriorityId } from "./defaultPriority";
import type { Priority } from "../types";

const p = (id: number, weight: number, is_builtin = true): Priority => ({ id, name: `P${id}`, color: null, weight, position: id, is_builtin });
const all = [p(1, 0.75), p(2, 1), p(3, 1.5)];

describe("default priority", () => {
  it("is the built-in weight-1 priority when nothing is saved", () => {
    expect(defaultPriorityId({}, all)).toBe(2);
  });
  it("is the saved choice", () => {
    expect(defaultPriorityId({ default_priority: { priority_id: 3 } }, all)).toBe(3);
  });
  it("is none when none is saved", () => {
    expect(defaultPriorityId({ default_priority: { priority_id: null } }, all)).toBeNull();
  });
  it("is none when the saved priority is gone", () => {
    expect(defaultPriorityId({ default_priority: { priority_id: 9 } }, all)).toBeNull();
  });
});
