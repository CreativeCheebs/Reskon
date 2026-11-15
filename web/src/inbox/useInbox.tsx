import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  // A reload answered after a change made here would bring back the old
  // list; each change bumps this so that answer is dropped.
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    api
      .get<InboxItem[]>("/inbox")
      .then((xs) => n === seq.current && setItems(xs))
      .catch(() => undefined);
  }, [reloadKey]);

  const add = useCallback(async (text: string) => {
    const it = await api.post<InboxItem>("/inbox", { text });
    seq.current++;
    setItems((xs) => [...xs, it]);
  }, []);
  const close = (path: string, method: "post" | "del") => async (id: number) => {
    await (method === "post" ? api.post(path.replace(":id", String(id)), {}) : api.del(path.replace(":id", String(id))));
    seq.current++;
    setItems((xs) => xs.filter((x) => x.id !== id));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triage = useCallback(close("/inbox/:id/triage", "post"), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const discard = useCallback(close("/inbox/:id", "del"), []);

  return <Ctx.Provider value={{ items, add, triage, discard }}>{children}</Ctx.Provider>;
}
