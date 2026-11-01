import { blend, palette } from "./palette";

// Hover, focus and selection styles that inline styles can't express. Kept
// short and quiet: 120ms fades and a 1px lift, nothing that bounces or
// flashes, and no motion at all for people who ask for less.
export function interactionCss(): string {
  const accentTint = blend(palette.accent, palette.bg, 0.2);
  const accentEdge = blend(palette.accent, palette.bg, 0.55);
  return `
    .jb-card {
      background: ${palette.panel};
      transition: background-color .12s ease, border-color .12s ease, box-shadow .12s ease, transform .12s ease;
    }
    .jb-card.jb-clickable:hover {
      background: ${blend(palette.hover, palette.panel, 0.7)};
      border-color: ${blend(palette.accent, palette.panel, 0.4)} !important;
      box-shadow: 0 6px 14px ${palette.shadow}59, 0 0 1px ${palette.shadow}80 !important;
      transform: translateY(-1px);
    }
    .jb-sortable { outline: none; border-radius: 8px; }
    .jb-sortable:focus-visible { box-shadow: 0 0 0 2px ${palette.accent}; }
    .jb-sortable:focus-visible .jb-card { border-color: ${palette.accent} !important; }

    /* Toolbar controls that are doing something (a filter, a sort, a
       grouping) wear the accent tint, so their state shows at a glance. */
    .jb-active.ant-btn, .jb-active.ant-btn:not(:disabled):hover {
      background: ${accentTint} !important;
      border-color: ${accentEdge} !important;
      color: ${palette.fg} !important;
    }
    .jb-active.ant-select .ant-select-selector {
      background: ${accentTint} !important;
      border-color: ${accentEdge} !important;
      color: ${palette.fg} !important;
    }
    /* Segmented switches in the view toolbar get the same outline as the
       selects and buttons beside them, so the row reads as one height. */
    .jb-toolbar .ant-segmented { outline: 1px solid ${palette.borderStrong}; outline-offset: -1px; }

    /* Sidebar (Sidebar.tsx). Rows, headings, footer and the name all start
       20px in; the icon rail centres everything instead. */
    .jb-sider .ant-layout-sider-children { display: flex; flex-direction: column; overflow: hidden; }
    .jb-sider-top { display: flex; align-items: center; gap: 6px; padding: 12px 10px 10px 20px; min-height: 52px; box-sizing: border-box; }
    .jb-sider-top-rail { flex-direction: column; gap: 8px; padding: 12px 0 10px; }
    .jb-sider-name { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; letter-spacing: .2px; color: ${palette.fg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .jb-nav-fold.ant-btn { color: ${palette.subtle}; }
    .jb-nav-fold.ant-btn:not(:disabled):hover { color: ${palette.fg}; background: ${blend(palette.fg, palette.panel, 0.06)}; }
    .jb-sider .ant-menu-item-group-title { padding: 14px 16px 6px 20px !important; line-height: 16px; }
    .jb-sider .ant-menu-item-group:first-child .ant-menu-item-group-title { padding-top: 6px !important; }
    .jb-nav-heading { font-size: 11px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: ${palette.subtle}; }
    .jb-sider .ant-menu-item-divider.jb-nav-divider, .jb-sider .jb-nav-divider { margin: 10px 20px 0 !important; border-color: ${palette.border} !important; }
    .jb-sider:not(.ant-layout-sider-collapsed) .ant-menu-item { padding-left: 12px !important; padding-right: 10px !important; }
    .jb-sider .ant-menu-item { position: relative; transition: background-color .12s ease, color .12s ease; }
    .jb-nav-icon { display: inline-flex !important; align-items: center; justify-content: center; width: 16px; transition: color .12s ease; }
    .jb-sider .ant-menu-item:not(.ant-menu-item-selected):not(.ant-menu-item-disabled):hover .jb-nav-icon { filter: brightness(1.25); }
    .jb-sider .ant-menu-item-selected { font-weight: 600; }
    .jb-sider .ant-menu-item-selected::before {
      content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: ${palette.accent};
    }
    .jb-sider .ant-menu-item-active:not(:hover):not(.ant-menu-item-selected) { background: transparent !important; }
    .jb-sider .jb-nav-new { color: ${palette.subtle} !important; }
    .jb-sider .jb-nav-new .jb-nav-icon { color: ${palette.subtle}; }
    .jb-sider .jb-nav-new:not(.ant-menu-item-disabled):hover, .jb-sider .jb-nav-new:not(.ant-menu-item-disabled):hover .jb-nav-icon { color: ${palette.accent} !important; }
    .jb-sider.ant-layout-sider-collapsed .ant-menu-item-group-title { display: none; }
    .jb-sider.ant-layout-sider-collapsed .jb-nav-divider { margin: 8px 12px !important; }
    /* Settings menu (admin/Settings.tsx): headings and rows share one left
       edge with the "Settings" title. */
    .jb-settings-nav .ant-menu-item-group-title { padding: 14px 8px 4px !important; line-height: 16px; }
    .jb-settings-nav .ant-menu-item-group:first-child .ant-menu-item-group-title { padding-top: 4px !important; }
    .jb-settings-nav .ant-menu-item { padding-inline: 8px !important; margin-inline: 0 !important; width: 100% !important; }
    .jb-settings-nav .ant-menu-item-selected { font-weight: 600; color: ${palette.accent} !important; }
    .jb-settings-nav .ant-menu-item-active:not(:hover):not(.ant-menu-item-selected) { background: transparent !important; }
    .jb-settings-nav.ant-menu { background: transparent; border-inline-end: none !important; }
    /* Settings page: menu column and one section, together at most 1120px
       wide. The menu scrolls on its own when it is taller than the screen. */
    .jb-settings {
      display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 32px; align-items: start;
      width: 100%; max-width: 1120px; padding: 4px 8px 32px; box-sizing: border-box;
    }
    .jb-settings-stacked { display: block; }
    .jb-settings-nav-col { position: sticky; top: 0; max-height: calc(100vh - 28px); overflow-y: auto; padding-bottom: 12px; }
    .jb-settings-page { font-size: 18px; font-weight: 600; line-height: 28px; color: ${palette.fg}; margin: 0 0 10px 8px; }
    .jb-settings-head { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .jb-settings-head .jb-settings-page { margin: 0; }
    .jb-settings-body { min-width: 0; max-width: 840px; }
    .jb-settings-title { font-size: 15px; font-weight: 600; line-height: 28px; color: ${palette.fg}; margin: 0; }
    .jb-settings-intro { margin: 2px 0 14px; max-width: 72ch; font-size: 13px; line-height: 1.5; color: ${palette.muted}; }
    .jb-settings-panel { background: ${palette.panel}; border: 1px solid ${palette.border}; border-radius: 8px; padding: 12px 16px 14px; }
    .jb-settings-subsection { margin-top: 18px; padding-top: 14px; border-top: 1px solid ${palette.border}; }
    .jb-lookup .ant-table, .jb-lookup .ant-table-thead > tr > th { background: transparent !important; }
    .jb-lookup .ant-table-thead > tr > th { white-space: nowrap; }
    .jb-lookup-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .jb-swatch { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1px ${palette.border}; }
    .jb-sider-foot { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 20px; border-top: 1px solid ${palette.border}; font-size: 12px; min-height: 52px; box-sizing: border-box; }
    .jb-sider-foot-rail { flex-direction: column; gap: 6px; padding: 10px 0; }
    .jb-sider.ant-layout-sider-zero-width .jb-sider-foot { display: none; }
    .jb-avatar {
      width: 26px; height: 26px; flex: none; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: ${palette.fg}; background: ${blend(palette.epic, palette.panel, 0.35)};
    }
    .jb-sider-user { flex: 1; min-width: 0; color: ${palette.fg}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .jb-nav-signout.ant-btn { color: ${palette.muted}; }
    .jb-nav-signout.ant-btn:not(:disabled):hover { color: ${palette.fg}; background: ${blend(palette.fg, palette.panel, 0.06)}; }
    @media (max-width: 767px) {
      .jb-sider { position: fixed !important; top: 0; bottom: 0; left: 0; }
      .jb-content { padding-top: 46px !important; }
    }

    .jb-add-task.ant-btn { color: ${palette.muted}; }
    .jb-add-task.ant-btn:not(:disabled):hover { color: ${palette.fg}; background: ${palette.hover}; }

    @media (prefers-reduced-motion: reduce) {
      .jb-card, .jb-card.jb-clickable:hover, .jb-sider .ant-menu-item, .jb-nav-icon { transition: none; transform: none; }
    }
  `;
}
