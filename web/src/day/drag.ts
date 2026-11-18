// What is being dragged in the planner. Browsers do not let a drop target read
// the dragged data while the pointer is still over it, so the planner keeps
// the one thing in hand here.

export type Dragged =
  | { type: "item"; id: number; taskId: number | null } // a line of the plan
  | { type: "task"; id: number }; // a task from Available tasks

export const drag: { current: Dragged | null; start: (d: Dragged) => void; end: () => void } = {
  current: null,
  start(d) {
    drag.current = d;
  },
  end() {
    drag.current = null;
  },
};
