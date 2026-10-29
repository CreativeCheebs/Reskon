import { useEffect, useState } from "react";
import { Alert, Button, Layout, Menu } from "antd";
import { message } from "./theme/feedback";
import { api } from "./api";
import { WriteButton } from "./offline";
import { useApp } from "./store";
import { palette } from "./theme/palette";
import { ViewScreen } from "./views/ViewScreen";
import { FirstRun } from "./admin/FirstRun";
import { Settings } from "./admin/Settings";
import { SessionsScreen } from "./sessions/SessionsScreen";
import { CaptureButton } from "./capture/CaptureButton";
import { CycleTimeScreen } from "./chart/CycleTimeScreen";
import { useAuth } from "./auth/AuthGate";
import { EpicsProvider } from "./task/useEpics";

// Screens are addressed by the URL hash (#/view/3, #/settings) so a reload
// lands where you were. Overlays like the backlog are never routes.

type Screen = { kind: "view"; id: number } | { kind: "settings" } | { kind: "sessions" } | { kind: "cycle" };

function parseHash(): Screen | null {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "view" && parts[1]) return { kind: "view", id: Number(parts[1]) };
  if (parts[0] === "settings" || parts[0] === "sessions" || parts[0] === "cycle") return { kind: parts[0] };
  return null;
}

function toHash(s: Screen) {
  return s.kind === "view" ? `#/view/${s.id}` : `#/${s.kind}`;
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

  const menuItems = [
    {
      type: "group" as const,
      label: "Views",
      key: "views",
      children: views.map((v) => ({ key: `view-${v.id}`, label: v.name })),
    },
    { type: "divider" as const },
    { key: "sessions", label: "Sessions" },
    { key: "cycle", label: "Cycle time" },
    { key: "settings", label: "Settings" },
  ];

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
    <Layout style={{ height: "100vh" }}>
      <Layout.Sider
        width={200}
        style={{ borderRight: `1px solid ${palette.border}`, position: "relative" }}
      >
        <div style={{ padding: "12px 16px", fontWeight: 700, letterSpacing: 0.3 }}>JitterBug</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith("view-")) go({ kind: "view", id: Number(key.slice(5)) });
            else go({ kind: key as "settings" | "sessions" | "cycle" });
          }}
        />
        <div style={{ padding: "8px 16px" }}>
          <WriteButton size="small" type="text" onClick={newView}>
            + New view
          </WriteButton>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 16px",
            borderTop: `1px solid ${palette.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: palette.muted }} title={user.username}>
            {user.username}
          </span>
          <Button size="small" type="text" onClick={logout}>
            Sign out
          </Button>
        </div>
      </Layout.Sider>
      <Layout>
        {!online && (
          <Alert
            banner
            type="warning"
            message="Offline — showing the last loaded data. Changes are disabled until the server is reachable."
          />
        )}
        <Layout.Content style={{ padding: 14, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {view && <ViewScreen key={view.id} view={view} />}
          {current.kind === "view" && !view && <Alert type="info" message="That view no longer exists." />}
          {current.kind === "settings" && <Settings />}
          {current.kind === "sessions" && <SessionsScreen />}
          {current.kind === "cycle" && <CycleTimeScreen />}
        </Layout.Content>
      </Layout>
      {boot.areas.length === 0 && <FirstRun />}
      <CaptureButton />
    </Layout>
    </EpicsProvider>
  );
}
