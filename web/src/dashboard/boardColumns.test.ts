import { describe, expect, it } from "vitest";
import { openColumns } from "./boardColumns";
import type { Bootstrap, Status, View } from "../types";

const st = (id: number, name: string, position: number) => ({ id, name, position, on_board: true }) as unknown as Status;
const boot = { statuses: [st(1, "To do", 1), st(2, "In progress", 2), st(3, "Waiting", 3)], priorities: [] } as unknown as Pick<Bootstrap, "statuses" | "priorities">;
const open = () => "todo" as const;
const view = (filter: object) => ({ filter, board_state: null }) as unknown as Pick<View, "filter" | "board_state">;

describe("openColumns with a status filter", () => {
  it("shows only the chosen statuses for \"is\"", () => {
    expect(openColumns(view({ statuses: [2] }), [], boot, open).map((c) => c.status.id)).toEqual([2]);
  });
  it("hides the chosen statuses for \"is not\"", () => {
    expect(openColumns(view({ statuses: [2], not: ["statuses"] }), [], boot, open).map((c) => c.status.id)).toEqual([1, 3]);
  });
});
