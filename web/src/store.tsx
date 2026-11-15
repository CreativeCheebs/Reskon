import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, isOnline, onOnlineChange } from "./api";
import type { Behaviour, Bootstrap, Status, View } from "./types";
import { today } from "./format";
import { reloadScheduler, startLive } from "./live";

// App-wide state: the bootstrap lookups, online/offline, and a reload
// counter that screens watch to refetch their own data on reconnect and
// when the day changes.

interface AppState {
  boot: Bootstrap;
  online: boolean;
  /** Bumped on reconnect, at a new day and after lookup edits; screens refetch when it changes. */
  reloadKey: number;
  reloadBootstrap: () => Promise<void>;
  /** Replace one view in the bootstrap without refetching anything. */
  updateView: (v: View) => void;
  /** Save one setting and keep the bootstrap's copy in step. */
  saveSetting: (key: string, value: unknown) => Promise<void>;
  behaviourOf: (statusId: number) => Behaviour | undefined;
  statusById: Map<number, Status>;
}

const Ctx = createContext<AppState | null>(null);

/** This tab has told the server its time zone (see reloadBootstrap). */
let zoneSent = false;

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [reloadKey, setReloadKey] = useState(0);

  const reloadBootstrap = useCallback(async () => {
    const b = await api.get<Bootstrap>("/bootstrap");
    setBoot(b);
    setReloadKey((k) => k + 1);
    // The server works out "today" (due dates, snoozes, charts) in your own
    // time zone; tell it which one this browser is in. Once per tab: on every
    // reload, two tabs (or a tab and the phone) in different zones would
    // each write theirs, and each write's live note would reload the other.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zoneSent && zone && b.settings.time_zone !== zone) api.put("/settings/time_zone", zone).catch(() => undefined);
    zoneSent = true;
  }, []);

  useEffect(() => {
    reloadBootstrap().catch(() => undefined);
    const off = onOnlineChange((v) => {
      setOnline(v);
      // Reconnect: refetch everything and re-enable. Nothing was queued.
      if (v) reloadBootstrap().catch(() => undefined);
    });
    return () => {
      off();
    };
  }, [reloadBootstrap]);

  // A new day: everything derived from "today" (snoozes waking, days to
  // due, the Day screen) is out of date, so reload as on a reconnect. A
  // sleeping laptop runs no timers, so coming back to the tab checks too.
  useEffect(() => {
    let day = today();
    const check = () => {
      if (today() === day) return;
      day = today();
      reloadBootstrap().catch(() => undefined);
    };
    const t = window.setInterval(check, 30_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [reloadBootstrap]);

  // Live updates: a change made anywhere else (another tab, the phone, a
  // plugin) reloads what this tab shows, as a reconnect does.
  useEffect(() => {
    const s = reloadScheduler(() => {
      reloadBootstrap().catch(() => undefined);
    });
    // A connection refused before it opened may mean the sign-in ended
    // elsewhere; one signed-in call lets the usual 401 handling sign out.
    const stop = startLive(
      () => s.note(),
      () => {
        api.get("/inbox").catch(() => undefined);
      },
    );
    return () => {
      stop();
      s.stop();
    };
  }, [reloadBootstrap]);

  const updateView = useCallback((v: View) => {
    setBoot((b) => (b ? { ...b, views: b.views.map((x) => (x.id === v.id ? v : x)) } : b));
  }, []);

  const saveSetting = useCallback(async (key: string, value: unknown) => {
    await api.put(`/settings/${key}`, value);
    setBoot((b) => (b ? { ...b, settings: { ...b.settings, [key]: value } } : b));
  }, []);

  const value = useMemo<AppState | null>(() => {
    if (!boot) return null;
    const statusById = new Map(boot.statuses.map((s) => [s.id, s]));
    const catById = new Map(boot.status_categories.map((c) => [c.id, c]));
    return {
      boot,
      online,
      reloadKey,
      reloadBootstrap,
      updateView,
      saveSetting,
      statusById,
      behaviourOf: (id) => {
        const s = statusById.get(id);
        return s ? catById.get(s.category_id)?.behaviour : undefined;
      },
    };
  }, [boot, online, reloadKey, reloadBootstrap, updateView, saveSetting]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The first on-board status in a todo category: where things land when they
 *  leave a hidden status like Backlog. Picks by behaviour, never by name. */
export function firstBoardTodoStatus(app: AppState): Status | undefined {
  return app.boot.statuses
    .filter((s) => s.on_board && app.behaviourOf(s.id) === "todo")
    .sort((a, b) => a.position - b.position)[0];
}
