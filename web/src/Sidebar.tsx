import { useState, type ReactNode } from "react";
import { Button, Layout, Menu, Tooltip } from "antd";
import {
  BranchesOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ProjectOutlined,
  SettingOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { OFFLINE_TIP, local } from "./offline";
import { blend, palette } from "./theme/palette";
import { CaptureButton } from "./capture/CaptureButton";
import { ViewIconMark } from "./icons/ViewIconMark";
import type { View } from "./types";

// The left sidebar: views, then the app's own screens, then who is signed
// in. On wide screens it folds to an icon rail (names in tooltips); under
// 768px it folds away entirely behind a tab, so phones get the full width.
// Its look (rows, hover, the selected row) lives in interactionStyles.ts.

const WIDE = 216;
const RAIL = 56;
const COLLAPSED_KEY = "jb.sider.collapsed";

export type NavKey = "settings" | "sessions" | "cycle" | "dashboard" | "day" | "states";

/** A view's accent when it has no colour of its own: a small, calm set,
 *  picked by id so a view keeps its colour when others are added. */
function viewAccent(id: number): string {
  const set = [palette.accent, palette.epic, palette.success, palette.warn];
  return set[id % set.length];
}

export function Sidebar(props: {
  views: View[];
  selectedKey: string;
  online: boolean;
  username: string;
  onView: (id: number) => void;
  onNav: (key: NavKey) => void;
  onNewView: () => void;
  onSignOut: () => void;
}) {
  const { views, selectedKey, online, username } = props;
  const [narrow, setNarrow] = useState(() => window.matchMedia?.("(max-width: 767.98px)").matches ?? false);
  const [folded, setFolded] = useState(() => local.get(COLLAPSED_KEY) === "1");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const collapsed = narrow ? !phoneOpen : folded;
  const rail = collapsed && !narrow;

  const fold = (v: boolean) => {
    setFolded(v);
    local.set(COLLAPSED_KEY, v ? "1" : "0");
  };

  // Every icon sits in the same 16px slot and gets its full colour only on
  // the selected row. Views keep a toned-down accent otherwise; the app's
  // own screens stay neutral, so colour marks views and the selection.
  const icon = (key: string, mark: ReactNode, color: string, calm = blend(color, palette.panel, 0.7)) => (
    <span className="jb-nav-icon" style={{ color: key === selectedKey ? color : calm }}>
      {mark}
    </span>
  );
  const heading = (text: string) => <span className="jb-nav-heading">{text}</span>;

  const viewItems = views.map((v) => {
    const key = `view-${v.id}`;
    const own = v.icon?.emoji || v.icon?.svg || v.color;
    const mark = own ? <ViewIconMark icon={v.icon} color={v.color} /> : v.layout === "table" ? <TableOutlined /> : <ProjectOutlined />;
    return { key, icon: icon(key, mark, viewAccent(v.id)), label: v.name, title: v.name };
  });
  const tool = (key: NavKey, mark: ReactNode, label: string) => ({ key, icon: icon(key, mark, palette.accent, palette.muted), label, title: label });

  const items = [
    {
      type: "group" as const,
      label: heading("Views"),
      key: "views",
      children: [
        ...viewItems,
        {
          key: "new-view",
          className: "jb-nav-new",
          disabled: !online,
          icon: <span className="jb-nav-icon"><PlusOutlined /></span>,
          title: online ? "New view" : OFFLINE_TIP,
          label: online ? "New view" : <Tooltip title={OFFLINE_TIP}>New view</Tooltip>,
        },
      ],
    },
    { type: "divider" as const, className: "jb-nav-divider" },
    {
      type: "group" as const,
      label: heading("Workspace"),
      key: "workspace",
      children: [
        tool("day", <CalendarOutlined />, "Day"),
        tool("dashboard", <DashboardOutlined />, "Dashboards"),
        tool("states", <ThunderboltOutlined />, "Buffs & debuffs"),
        tool("sessions", <FieldTimeOutlined />, "Sessions"),
        tool("cycle", <BranchesOutlined />, "Cycle time"),
        tool("settings", <SettingOutlined />, "Settings"),
      ],
    },
  ];

  const foldButton = (
    <Tooltip title={rail ? "Expand sidebar" : "Collapse sidebar"} placement="right">
      <Button
        size="small"
        type="text"
        className="jb-nav-fold"
        aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
        icon={rail ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => fold(!folded)}
      />
    </Tooltip>
  );
  const initial = username.slice(0, 1).toUpperCase() || "?";

  return (
    <Layout.Sider
      width={WIDE}
      collapsedWidth={narrow ? 0 : RAIL}
      collapsed={collapsed}
      breakpoint="md"
      onBreakpoint={(broken) => {
        setNarrow(broken);
        setPhoneOpen(false);
      }}
      onCollapse={(c, type) => type === "clickTrigger" && setPhoneOpen(!c)}
      // Only the phone layout uses antd's tab; wide screens use the fold button.
      trigger={narrow ? undefined : null}
      zeroWidthTriggerStyle={{ top: 6, zIndex: 20 }}
      className="jb-sider"
      style={{ borderRight: `1px solid ${palette.border}`, position: "relative", zIndex: 10 }}
    >
      <div className={rail ? "jb-sider-top jb-sider-top-rail" : "jb-sider-top"}>
        {!rail && <span className="jb-sider-name">JitterBug</span>}
        <CaptureButton />
        {!narrow && foldButton}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        inlineIndent={12}
        selectedKeys={[selectedKey]}
        items={items}
        style={{ borderInlineEnd: "none", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        onClick={({ key }) => {
          if (key === "new-view") props.onNewView();
          else if (key.startsWith("view-")) props.onView(Number(key.slice(5)));
          else props.onNav(key as NavKey);
        }}
      />
      <div className={rail ? "jb-sider-foot jb-sider-foot-rail" : "jb-sider-foot"}>
        <Tooltip title={rail ? `Signed in as ${username}` : undefined} placement="right">
          <span className="jb-avatar" aria-hidden>
            {initial}
          </span>
        </Tooltip>
        {!rail && (
          <span className="jb-sider-user" title={username}>
            {username}
          </span>
        )}
        <Tooltip title={rail ? "Sign out" : undefined} placement="right">
          <Button size="small" type="text" className="jb-nav-signout" aria-label="Sign out" icon={rail ? <LogoutOutlined /> : undefined} onClick={props.onSignOut}>
            {rail ? null : "Sign out"}
          </Button>
        </Tooltip>
      </div>
    </Layout.Sider>
  );
}
