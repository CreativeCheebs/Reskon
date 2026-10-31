import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Button, Layout, Menu, Spin, Tooltip } from "antd";
import {
  BranchesOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  ProjectOutlined,
  SettingOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { message } from "./theme/feedback";
import { api } from "./api";
import { OFFLINE_TIP } from "./offline";
import { useApp } from "./store";
import { palette } from "./theme/palette";
import { ViewScreen } from "./views/ViewScreen";
import { FirstRun } from "./admin/FirstRun";
import { CaptureButton } from "./capture/CaptureButton";
import { useAuth } from "./auth/AuthGate";
import { EpicsProvider } from "./task/useEpics";
import { ThemeSync } from "./theme/ThemeSync";
import { ViewIconMark } from "./icons/ViewIconMark";
import { InForceBar } from "./states/InForceBar";

// Screens opened now and then load on first visit, keeping them out of the
// bundle every page load parses.
const Settings = lazy(() => import("./admin/Settings").then((m) => ({ default: m.Settings })));
const SessionsScreen = lazy(() => import("./sessions/SessionsScreen").then((m) => ({ default: m.SessionsScreen })));
const CycleTimeScreen = lazy(() => import("./chart/CycleTimeScreen").then((m) => ({ default: m.CycleTimeScreen })));
const StatesScreen = lazy(() => import("./states/StatesScreen").then((m) => ({ default: m.StatesScreen })));
const DayScreen = lazy(() => import("./day/DayScreen").then((m) => ({ default: m.DayScreen })));
const DashboardScreen = lazy(() => import("./dashboard/DashboardScreen").then((m) => ({ default: m.DashboardScreen })));

// Screens are addressed by the URL hash (#/view/3, #/settings) so a reload
// lands where you were. Overlays like the backlog are never routes.

type Screen =
  | { kind: "view"; id: number }
  | { kind: "dashboard"; id?: number }
  | { kind: "day"; date?: string }
  | { kind: "settings" }
  | { kind: "sessions" }
  | { kind: "cycle" }
  | { kind: "states" };

function parseHash(): Screen | null {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "view" && parts[1]) return { kind: "view", id: Number(parts[1]) };
  if (parts[0] === "day") return { kind: "day", date: parts[1] || undefined };
  if (parts[0] === "dashboard") return { kind: "dashboard", id: parts[1] ? Number(parts[1]) : undefined };
  if (parts[0] === "settings" || parts[0] === "sessions" || parts[0] === "cycle" || parts[0] === "states") return { kind: parts[0] };
  return null;
}

function toHash(s: Screen) {
  if (s.kind === "view") return `#/view/${s.id}`;
  if (s.kind === "dashboard") return s.id ? `#/dashboard/${s.id}` : "#/dashboard";
  if (s.kind === "day") return s.date ? `#/day/${s.date}` : "#/day";
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

  // Every row has a 16px symbol slot, so names line up under one another;
  // section headings sit to the left of it, small and quiet.
  const row = (mark: React.ReactNode, text: React.ReactNode) => (
    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span className="jb-nav-icon" style={{ width: 16, display: "inline-flex", justifyContent: "center", flex: "none" }}>
        {mark}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </span>
  );
  const heading = (text: string) => (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: palette.subtle }}>{text}</span>
  );
  const menuItems = [
    {
      type: "group" as const,
      label: heading("Views"),
      key: "views",
      children: [
        ...views.map((v) => ({
          key: `view-${v.id}`,
          label: row(
            v.icon?.emoji || v.icon?.svg || v.color ? (
              <ViewIconMark icon={v.icon} color={v.color} />
            ) : v.layout === "table" ? (
              <TableOutlined />
            ) : (
              <ProjectOutlined />
            ),
            v.name,
          ),
        })),
        {
          key: "new-view",
          disabled: !online,
          label: (
            <Tooltip title={online ? undefined : OFFLINE_TIP}>
              <span style={{ color: palette.subtle }}>{row(<PlusOutlined />, "New view")}</span>
            </Tooltip>
          ),
        },
      ],
    },
    // One divider, between the views and the app's own screens.
    { type: "divider" as const, style: { margin: "8px 20px", borderColor: palette.border } },
    {
      type: "group" as const,
      label: heading("Workspace"),
      key: "workspace",
      children: [
        { key: "day", label: row(<CalendarOutlined />, "Day") },
        { key: "dashboard", label: row(<DashboardOutlined />, "Dashboards") },
        { key: "states", label: row(<ThunderboltOutlined />, "Buffs & debuffs") },
        { key: "sessions", label: row(<FieldTimeOutlined />, "Sessions") },
        { key: "cycle", label: row(<BranchesOutlined />, "Cycle time") },
        { key: "settings", label: row(<SettingOutlined />, "Settings") },
      ],
    },
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
      {/* Under 768px the sidebar folds away behind a tab, so phones get the
          full width (dashboards stack in one column there). */}
      <Layout.Sider
        width={200}
        breakpoint="md"
        collapsedWidth={0}
        zeroWidthTriggerStyle={{ top: 6, zIndex: 20 }}
        className="jb-sider"
        style={{ borderRight: `1px solid ${palette.border}`, position: "relative", zIndex: 10 }}
      >
        <style>{`
          .jb-sider .ant-layout-sider-children { overflow: hidden; }
          .jb-sider .ant-menu-item-group-title { padding: 12px 16px 4px 20px !important; }
          .jb-sider .ant-menu-item { padding-left: 30px !important; }
          .jb-sider.ant-layout-sider-collapsed .jb-sider-foot { display: none !important; }
          @media (max-width: 767px) {
            .jb-sider { position: fixed !important; top: 0; bottom: 0; left: 0; }
            .jb-content { padding-top: 46px !important; }
          }
        `}</style>
        <div style={{ padding: "12px 12px 8px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontWeight: 700, letterSpacing: 0.3 }}>JitterBug</span>
          <CaptureButton />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          inlineIndent={12}
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderInlineEnd: "none", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}
          onClick={({ key }) => {
            if (key === "new-view") newView();
            else if (key.startsWith("view-")) go({ kind: "view", id: Number(key.slice(5)) });
            else go({ kind: key as "settings" | "sessions" | "cycle" | "dashboard" | "day" | "states" });
          }}
        />
        <div
          className="jb-sider-foot"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 12px 10px 20px",
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
        <Layout.Content className="jb-content" style={{ padding: 14, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <InForceBar onOpen={() => go({ kind: "states" })} />
          {view && <ViewScreen key={view.id} view={view} />}
          {current.kind === "view" && !view && <Alert type="info" message="That view no longer exists." />}
          <Suspense fallback={<Spin style={{ margin: 40 }} />}>
            {current.kind === "settings" && <Settings />}
            {current.kind === "sessions" && <SessionsScreen />}
            {current.kind === "cycle" && <CycleTimeScreen />}
            {current.kind === "states" && <StatesScreen />}
            {current.kind === "day" && <DayScreen date={current.date} onDate={(date) => go({ kind: "day", date })} />}
            {current.kind === "dashboard" && <DashboardScreen id={current.id} onOpen={(id) => go({ kind: "dashboard", id })} />}
          </Suspense>
        </Layout.Content>
      </Layout>
      {boot.areas.length === 0 && <FirstRun />}
      <ThemeSync />
    </Layout>
    </EpicsProvider>
  );
}
