import { useState, type ReactNode } from "react";
import { Button, Layout, Menu, Tooltip } from "antd";
import {
  BranchesOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ProjectOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { OFFLINE_TIP, local } from "./offline";
import { blend, palette } from "./theme/palette";
import { CaptureButton } from "./capture/CaptureButton";
import { ViewIconMark } from "./icons/ViewIconMark";
import type { View } from "./types";
import { useInbox } from "./inbox/useInbox";
import { INBOX_SHORTCUT } from "./inbox/InboxQuickAdd";
import { SEARCH_SHORTCUT } from "./search/GlobalSearch";
import { useConnectedApps } from "./apps/useConnectedApps";
import { appIcon } from "./apps/AppIcon";
import type { ConnectedApp } from "./apps/types";

// The left sidebar: views, then the app's own screens, then who is signed
// in. On wide screens it folds to an icon rail (names in tooltips); under
// 768px it folds away entirely behind a tab, so phones get the full width.
// Its look (rows, hover, the selected row) lives in interactionStyles.ts.

const WIDE = 228;
const RAIL = 56;
const COLLAPSED_KEY = "jb.sider.collapsed";

/** Text for screen readers only. */
const HIDDEN = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

export type NavKey = "settings" | "sessions" | "cycle" | "dashboard" | "day" | "states" | "inbox" | "search";

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
  /** Settings › Screens: whether the Day screen has a place here. */
  showDay: boolean;
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
  const { items: inbox } = useInbox();
  const connectedApps = useConnectedApps();
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
  const tool = (key: NavKey, mark: ReactNode, label: ReactNode, title = String(label)) => ({ key, icon: icon(key, mark, palette.accent, palette.muted), label, title });

  // One row per connected app. The label is a real link, so middle-click and
  // "copy link" work; it opens the app's own page in a new tab. An app that
  // cannot be reached stays listed with a warning icon (not colour alone),
  // quieter text and the reason in its tooltip. Only the text colour is
  // lowered, to a palette colour already kept readable; fading the whole row
  // would drop a working link below the contrast needed.
  const appItem = (a: ConnectedApp) => {
    const key = `app-${a.id}`;
    const down = a.status !== "ok";
    // The words match Settings › Apps: "Can't reach it" and "Problem".
    const why = a.status_detail || (a.status === "invalid" ? "its description is not valid" : "it did not answer");
    const state = a.status === "invalid" ? `has a problem (${why})` : `can't be reached (${why})`;
    const title = down ? `${a.name}: ${state}` : a.home_link ? `${a.name} (opens in a new tab)` : `${a.name} (no page address)`;
    const textColor = down ? { color: palette.subtle } : undefined;
    // Without a page address there is no link to carry the name, so the status
    // goes in as text only screen readers see.
    const label = a.home_link ? (
      <a href={a.home_link} target="_blank" rel="noopener noreferrer" aria-label={title} style={textColor}>
        {a.name}
      </a>
    ) : (
      <span style={textColor}>
        {a.name}
        <span style={HIDDEN}>{title.slice(a.name.length)}</span>
      </span>
    );
    return {
      key,
      icon: icon(key, appIcon(a.manifest?.icon, down), palette.muted, palette.muted),
      label,
      title,
    };
  };

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
    ...(connectedApps.length > 0
      ? [
          {
            type: "group" as const,
            label: heading("Apps"),
            key: "apps",
            children: connectedApps.map(appItem),
          },
          { type: "divider" as const, className: "jb-nav-divider", key: "apps-divider" },
        ]
      : []),
    {
      type: "group" as const,
      label: heading("Workspace"),
      key: "workspace",
      children: [
        tool("search", <SearchOutlined />, "Search", `Search (${SEARCH_SHORTCUT})`),
        tool(
          "inbox",
          <InboxOutlined />,
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            Inbox
            {inbox.length > 0 && <span className="jb-nav-count">{inbox.length}</span>}
          </span>,
          `Inbox${inbox.length ? ` · ${inbox.length}` : ""} (${INBOX_SHORTCUT} adds)`,
        ),
        ...(props.showDay ? [tool("day", <CalendarOutlined />, "Day")] : []),
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
        className="jb-nav-fold jb-hit"
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
        {!rail && <span className="jb-sider-name"><span className="jb-brand-mark" aria-hidden="true">&#9685;</span>Reskon</span>}
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
        onClick={({ key, domEvent }) => {
          if (key.startsWith("app-")) {
            // A click on the link opens the tab itself. Enter on the row, or a
            // click beside the link, does not, so do it here.
            const a = connectedApps.find((x) => `app-${x.id}` === key);
            if (a?.home_link && !(domEvent.target as HTMLElement).closest("a")) window.open(a.home_link, "_blank", "noopener,noreferrer");
          } else if (key === "new-view") props.onNewView();
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
          <Button size="small" type="text" className="jb-nav-signout jb-hit" aria-label="Sign out" icon={rail ? <LogoutOutlined /> : undefined} onClick={props.onSignOut}>
            {rail ? null : "Sign out"}
          </Button>
        </Tooltip>
      </div>
    </Layout.Sider>
  );
}
