import { useCallback } from "react";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import type { BoardState, View } from "../types";

// Saves a view's UI state (collapsed columns, grouping, layout) the moment
// it changes. The screen updates at once; the server write follows.
export function useSaveView(view: View) {
  const { updateView, online } = useApp();

  const save = useCallback(
    async (patch: Partial<Pick<View, "layout" | "name">> & { board_state?: BoardState }) => {
      const next: View = { ...view, ...patch, board_state: { ...view.board_state, ...(patch.board_state ?? {}) } };
      updateView(next);
      if (!online) return;
      try {
        const body: Record<string, unknown> = { ...patch };
        if (patch.board_state) body.board_state = next.board_state;
        updateView(await api.patch<View>(`/views/${view.id}`, body));
      } catch (e) {
        message.error(`Couldn't save the view: ${(e as Error).message}`);
        updateView(view);
      }
    },
    [view, updateView, online],
  );
  return save;
}
