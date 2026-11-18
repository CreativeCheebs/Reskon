import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Status, View } from "../types";

vi.mock("../store", () => ({ useApp: () => ({ online: true, boot: { settings: {} }, behaviourOf: (id: number) => (id === 2 ? "done" : "todo") }) }));
vi.mock("@dnd-kit/core", () => ({ useDroppable: () => ({ setNodeRef: () => {}, isOver: false }) }));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({}),
  verticalListSortingStrategy: {},
}));
vi.mock("./AddTaskModal", () => ({
  AddTaskModal: (p: { statusId: number; defaults: object }) => (
    <div data-testid="modal">
      {p.statusId}:{JSON.stringify(p.defaults)}
    </div>
  ),
}));
vi.mock("./ColumnLimitControl", () => ({ ColumnLimitControl: () => null }));
vi.mock("./DoneWindow", () => ({ DoneWindow: () => null }));
vi.mock("../views/ViewBackdrop", async (orig) => ({ ...(await orig<object>()), useSurfaceOpacity: () => 1 }));

import { Column } from "./Column";

const status = (id: number, name: string) => ({ id, name, color: null }) as unknown as Status;
function renderColumn(s: Status, disabled = false) {
  render(
    <Column
      status={s}
      taskIds={[]}
      byId={new Map()}
      config={{} as never}
      disabled={disabled}
      view={{} as View}
      collapsed={false}
      onToggleCollapse={() => {}}
      limit={undefined}
      onSetLimit={() => {}}
      inLane={false}
      createDefaults={{ priority_id: 4 }}
      onOpenTask={() => {}}
      onCreated={() => {}}
      onTaskChanged={() => {}}
      onTaskDeleted={() => {}}
    />,
  );
}

describe("a column's header", () => {
  afterEach(cleanup);

  it("has a + Add button that opens the New task pop-up for that column", () => {
    renderColumn(status(1, "To do"));
    fireEvent.click(screen.getByRole("button", { name: "Add a task to To do" }));
    expect(screen.getByTestId("modal").textContent).toBe('1:{"priority_id":4}');
  });

  it("has no add button on a Done column, and no add row at the foot", () => {
    renderColumn(status(2, "Done"));
    expect(screen.queryByRole("button", { name: /Add a task/ })).toBeNull();
    expect(screen.queryByText("Add task")).toBeNull();
  });

  it("disables the button while offline", () => {
    renderColumn(status(1, "To do"), true);
    expect((screen.getByRole("button", { name: "Add a task to To do" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
