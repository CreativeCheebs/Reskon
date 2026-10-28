import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { Board } from "../board/Board";
import { HiddenStatusOverlay } from "../board/HiddenStatusOverlay";
import { TaskPanel } from "../task/TaskPanel";
import { TaskTable } from "./TaskTable";
import { ViewSettings } from "./ViewSettings";
import { cardConfigOf } from "./cardConfig";
import type { Task, View } from "../types";

// Loads a view's tasks (the server resolves the filter) and renders the
// board or the table, plus the overlays that hang off it.

export function ViewScreen({ view }: { view: View }) {
  const { reloadKey } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStatus, setHiddenStatus] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);

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
  }, [reloadKey, view.filter, refetch]);

  if (!tasks) return error ? <Alert type="error" message={error} /> : <Spin />;

  const update = (fn: (prev: Task[]) => Task[]) => setTasks((prev) => fn(prev ?? []));
  const replace = (t: Task) => update((prev) => prev.map((x) => (x.id === t.id ? t : x)));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{view.name}</div>
        <div style={{ flex: 1 }} />
        <Button size="small" onClick={() => setSettings(true)}>
          View settings
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {view.layout === "board" ? (
          <Board
            view={view}
            tasks={tasks}
            setTasks={update}
            refetch={refetch}
            onOpenTask={setOpenTask}
            onOpenHidden={setHiddenStatus}
          />
        ) : (
          <TaskTable tasks={tasks} config={cardConfigOf(view)} onOpenTask={setOpenTask} />
        )}
      </div>
      {hiddenStatus !== null && (
        <HiddenStatusOverlay
          statusId={hiddenStatus}
          tasks={tasks}
          onClose={() => setHiddenStatus(null)}
          onMoved={replace}
          onOpenTask={setOpenTask}
        />
      )}
      {openTask !== null && (
        <TaskPanel
          taskId={openTask}
          onClose={() => {
            setOpenTask(null);
            refetch();
          }}
          onChanged={replace}
          onDeleted={(id) => update((prev) => prev.filter((t) => t.id !== id))}
        />
      )}
      {settings && <ViewSettings view={view} sample={tasks[0]} onClose={() => setSettings(false)} />}
    </div>
  );
}
