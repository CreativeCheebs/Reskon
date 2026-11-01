import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Layout, Spin } from "antd";
import { message } from "./theme/feedback";
import { api } from "./api";
import { useApp } from "./store";
import { ViewScreen } from "./views/ViewScreen";
import { FirstRun } from "./admin/FirstRun";
import { useAuth } from "./auth/AuthGate";
import { EpicsProvider } from "./task/useEpics";
import { ThemeSync } from "./theme/ThemeSync";
import { Sidebar } from "./Sidebar";
import { InForceBar } from "./states/InForceBar";
import { InboxProvider } from "./inbox/useInbox";
import { InboxQuickAdd } from "./inbox/InboxQuickAdd";

// Screens opened now and then load on first visit, keeping them out of the
// bundle every page load parses.
const Settings = lazy(() => import("./admin/Settings").then((m) => ({ default: m.Settings })));
const SessionsScreen = lazy(() => import("./sessions/SessionsScreen").then((m) => ({ default: m.SessionsScreen })));
const CycleTimeScreen = lazy(() => import("./chart/CycleTimeScreen").then((m) => ({ default: m.CycleTimeScreen })));
const StatesScreen = lazy(() => import("./states/StatesScreen").then((m) => ({ default: m.StatesScreen })));
const DayScreen = lazy(() => import("./day/DayScreen").then((m) => ({ default: m.DayScreen })));
const InboxScreen = lazy(() => import("./inbox/InboxScreen").then((m) => ({ default: m.InboxScreen })));
const DashboardScreen = lazy(() => import("./dashboard/DashboardScreen").then((m) => ({ default: m.DashboardScreen })));

// Screens are addressed by the URL hash (#/view/3, #/settings) so a reload
// lands where you were. Overlays like the backlog are never routes.

type Screen =
  | { kind: "view"; id: number }
  | { kind: "dashboard"; id?: number }
  | { kind: "day"; date?: string }
  | { kind: "settings"; section?: string }
  | { kind: "sessions" }
  | { kind: "cycle" }
  | { kind: "states" }
  | { kind: "inbox" };

function parseHash(): Screen | null {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "view" && parts[1]) return { kind: "view", id: Number(parts[1]) };
  if (parts[0] === "day") return { kind: "day", date: parts[1] || undefined };
  if (parts[0] === "dashboard") return { kind: "dashboard", id: parts[1] ? Number(parts[1]) : undefined };
  if (parts[0] === "settings") return { kind: "settings", section: parts[1] || undefined };
  if (parts[0] === "sessions" || parts[0] === "cycle" || parts[0] === "states" || parts[0] === "inbox") return { kind: parts[0] };
  return null;
}

function toHash(s: Screen) {
  if (s.kind === "view") return `#/view/${s.id}`;
  if (s.kind === "dashboard") return s.id ? `#/dashboard/${s.id}` : "#/dashboard";
  if (s.kind === "day") return s.date ? `#/day/${s.date}` : "#/day";
  if (s.kind === "settings") return s.section ? `#/settings/${s.section}` : "#/settings";
  return `#/${s.kind}`;
}

export function App() {
  const { boot, online, reloadBootstrap } = useApp();
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState<Screen | null>(parseHash);

  useEffect(() => {
    const on = () => setScreen(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (s: Screen) => {
    window.location.hash = toHash(s);
    setScreen(s);
  };

  const views = [...boot.views].sort((a, b) => a.position - b.position);
  const current = screen ?? (views[0] ? { kind: "view" as const, id: views[0].id } : { kind: "settings" as const });
  const view = current.kind === "view" ? views.find((v) => v.id === current.id) : undefined;

  const newView = async () => {
    try {
      const v = await api.post<{ id: number }>("/views", {
        name: "New view",
        layout: "board",
        filter: { areas: null, statuses: null, difficulty_min: null, custom: null, include_done_days: 7 },
        position: views.length,
      });
      await reloadBootstrap();
      go({ kind: "view", id: v.id });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const selectedKey = current.kind === "view" ? `view-${current.id}` : current.kind;

  return (
    <EpicsProvider>
    <InboxProvider>
    <Layout style={{ height: "100vh" }}>
      <Sidebar
        views={views}
        selectedKey={selectedKey}
        online={online}
        username={user.username}
        onView={(id) => go({ kind: "view", id })}
        onNav={(kind) => go({ kind })}
        onNewView={newView}
        onSignOut={logout}
      />
      <Layout>
        {!online && (
          <Alert
            banner
            type="warning"
            message="Offline — showing the last loaded data. Changes are disabled until the server is reachable."
          />
        )}
        <Layout.Content className="jb-content" style={{ padding: 14, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <InForceBar onOpen={() => go({ kind: "states" })} />
          {view && <ViewScreen key={view.id} view={view} />}
          {current.kind === "view" && !view && <Alert type="info" message="That view no longer exists." />}
          <Suspense fallback={<Spin style={{ margin: 40 }} />}>
            {current.kind === "settings" && <Settings section={current.section} onSection={(section) => go({ kind: "settings", section })} />}
            {current.kind === "sessions" && <SessionsScreen />}
            {current.kind === "cycle" && <CycleTimeScreen />}
            {current.kind === "states" && <StatesScreen />}
            {current.kind === "inbox" && <InboxScreen />}
            {current.kind === "day" && <DayScreen date={current.date} onDate={(date) => go({ kind: "day", date })} />}
            {current.kind === "dashboard" && <DashboardScreen id={current.id} onOpen={(id) => go({ kind: "dashboard", id })} />}
          </Suspense>
        </Layout.Content>
      </Layout>
      {boot.areas.length === 0 && <FirstRun />}
      <ThemeSync />
      <InboxQuickAdd />
    </Layout>
    </InboxProvider>
    </EpicsProvider>
  );
}
