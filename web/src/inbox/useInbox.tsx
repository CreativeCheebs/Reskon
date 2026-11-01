import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { useApp } from "../store";

// The inbox's lines, shared by the sidebar count, the quick-add dialog and
// the Inbox screen, so one change shows everywhere at once.

export interface InboxItem {
  id: number;
  text: string;
  created_at: string;
}

interface InboxState {
  items: InboxItem[];
  add: (text: string) => Promise<void>;
  /** The line became a task or session. */
  triage: (id: number) => Promise<void>;
  discard: (id: number) => Promise<void>;
}

const Ctx = createContext<InboxState | null>(null);

export function useInbox(): InboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInbox outside InboxProvider");
  return v;
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const { reloadKey } = useApp();
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    api.get<InboxItem[]>("/inbox").then(setItems).catch(() => undefined);
  }, [reloadKey]);

  const add = useCallback(async (text: string) => {
    const it = await api.post<InboxItem>("/inbox", { text });
    setItems((xs) => [...xs, it]);
  }, []);
  const close = (path: string, method: "post" | "del") => async (id: number) => {
    await (method === "post" ? api.post(path.replace(":id", String(id)), {}) : api.del(path.replace(":id", String(id))));
    setItems((xs) => xs.filter((x) => x.id !== id));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triage = useCallback(close("/inbox/:id/triage", "post"), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const discard = useCallback(close("/inbox/:id", "del"), []);

  return <Ctx.Provider value={{ items, add, triage, discard }}>{children}</Ctx.Provider>;
}
