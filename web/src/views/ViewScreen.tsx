import { useCallback, useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { Board } from "../board/Board";
import { HiddenStatusOverlay } from "../board/HiddenStatusOverlay";
import type { Task, View } from "../types";

// Loads a view's tasks (the server resolves the filter) and renders the
// board or the table, plus the overlays that hang off it.

export function ViewScreen({ view }: { view: View }) {
  const { reloadKey } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStatus, setHiddenStatus] = useState<number | null>(null);

  const refetch = useCallback(() => {
    api
      .get<Task[]>(`/tasks?view=${view.id}`)
      .then((t) => {
        setTasks(t);
        setError(null);
      })
      // Offline: keep showing the last loaded data.
      .catch((e) => setError((e as Error).message));
  }, [view.id]);

  useEffect(() => {
    setTasks(null);
    refetch();
  }, [refetch]);
  useEffect(() => {
    refetch();
  }, [reloadKey, refetch]);

  if (!tasks) return error ? <Alert type="error" message={error} /> : <Spin />;

  const update = (fn: (prev: Task[]) => Task[]) => setTasks((prev) => fn(prev ?? []));
  const replace = (t: Task) => update((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  const openTask = (_id: number) => undefined;

  return (
    <>
      <Board
        view={view}
        tasks={tasks}
        setTasks={update}
        refetch={refetch}
        onOpenTask={openTask}
        onOpenHidden={setHiddenStatus}
      />
      {hiddenStatus !== null && (
        <HiddenStatusOverlay
          statusId={hiddenStatus}
          tasks={tasks}
          onClose={() => setHiddenStatus(null)}
          onMoved={replace}
          onOpenTask={openTask}
        />
      )}
    </>
  );
}
