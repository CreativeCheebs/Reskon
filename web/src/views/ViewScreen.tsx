import { useCallback, useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { Board } from "../board/Board";
import type { Task, View } from "../types";

// Loads a view's tasks (the server resolves the filter) and renders the
// board or the table. Child screens are added in later steps.

export function ViewScreen({ view }: { view: View }) {
  const { reloadKey } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Board
      view={view}
      tasks={tasks}
      setTasks={update}
      refetch={refetch}
      onOpenTask={() => undefined}
      onOpenHidden={() => undefined}
    />
  );
}
