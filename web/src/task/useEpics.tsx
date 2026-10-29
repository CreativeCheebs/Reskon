import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { useApp } from "../store";
import type { Task } from "../types";

// Every epic, for pickers, filters, card labels and group titles. Fetched
// once for the app; call refresh() after creating or renaming an epic.

interface Epics {
  epics: Task[];
  byId: Map<number, Task>;
  refresh: () => void;
}

const Ctx = createContext<Epics>({ epics: [], byId: new Map(), refresh: () => undefined });

export function EpicsProvider({ children }: { children: ReactNode }) {
  const { reloadKey } = useApp();
  const [epics, setEpics] = useState<Task[]>([]);
  const refresh = useCallback(() => {
    api
      .get<Task[]>("/tasks?type=epic")
      .then((e) => setEpics([...e].sort((a, b) => a.title.localeCompare(b.title))))
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [reloadKey, refresh]);
  return <Ctx.Provider value={{ epics, byId: new Map(epics.map((e) => [e.id, e])), refresh }}>{children}</Ctx.Provider>;
}

export const useEpics = () => useContext(Ctx);
