import type { Behaviour, Bootstrap, Status, Task, View } from "../types";
import { filterOf } from "../views/cardConfig";
import { boardComparator } from "../board/sorting";

// The columns of a board widget: the view's own board columns (on-board
// statuses, narrowed the way the view narrows them, in board order) that
// still have work in them. A column is open or not by its category's
// behaviour, never by the status's name. The tasks come from the server
// already filtered by the view; this only chooses what to draw.

/** Cards drawn per column; the rest are "+N more", which opens the view. */
export const CARDS_PER_COLUMN = 20;

export interface OpenColumn {
  status: Status;
  /** Every task in the column, in the view's card order. */
  count: number;
  /** The first CARDS_PER_COLUMN of them. */
  shown: Task[];
}

const OPEN: Behaviour[] = ["todo", "in_progress"];

export function openColumns(
  view: Pick<View, "filter" | "board_state">,
  tasks: Task[],
  boot: Pick<Bootstrap, "statuses" | "priorities">,
  behaviourOf: (statusId: number) => Behaviour | undefined,
): OpenColumn[] {
  const f = filterOf(view as View);
  const allowed = f.statuses;
  const negated = !!f.not?.includes("statuses");
  const statuses = boot.statuses
    .filter((s) => s.on_board && (!allowed || allowed.includes(s.id) !== negated))
    .filter((s) => OPEN.includes(behaviourOf(s.id) as Behaviour))
    .sort((a, b) => a.position - b.position);
  // The same tasks the full board shows: snoozed ones are asleep, and
  // blocked ones wait under their own button unless the view shows them.
  const hideBlocked = view.board_state?.hide_blocked ?? true;
  const visible = tasks.filter((t) => !t.snoozed && !(hideBlocked && t.blocked));
  const compare = boardComparator(view.board_state?.sort ?? "manual", boot);
  return statuses.map((status) => {
    const all = visible.filter((t) => t.status_id === status.id).sort(compare);
    return { status, count: all.length, shown: all.slice(0, CARDS_PER_COLUMN) };
  });
}
