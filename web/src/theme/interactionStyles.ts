import { blend, palette } from "./palette";
import { similarStyles } from "../task/SimilarTasks";

// Hover, focus and selection styles that inline styles can't express. Kept
// short and quiet: 120ms fades and a 1px lift, nothing that bounces or
// flashes, and no motion at all for people who ask for less.
export function interactionCss(): string {
  const accentTint = blend(palette.accent, palette.bg, 0.2);
  const accentEdge = blend(palette.accent, palette.bg, 0.55);
  const segSelected = blend(palette.accent, palette.panelDim, 0.3);
  const segSelectedEdge = blend(palette.accent, palette.panelDim, 0.5);
  return `
    .jb-card {
      background: ${palette.panel};
      transition: background-color .12s ease, border-color .12s ease, box-shadow .12s ease;
    }
    /* Hover brightens the surface and the border a little; the card never
       moves or changes size. */
    .jb-card.jb-clickable:hover, .jb-card.jb-card-pinned {
      background: ${blend(palette.hover, palette.panel, 0.75)};
      border-color: ${blend(palette.borderStrong, palette.border, 0.6)} !important;
    }
    .jb-sortable { outline: none; border-radius: 8px; }
    .jb-sortable:focus-visible { box-shadow: 0 0 0 2px ${palette.accent}; }
    .jb-sortable:focus-visible .jb-card { border-color: ${palette.accent} !important; }

    /* A board card's quick-action rail: hidden until the card is hovered,
       focused from the keyboard, or one of the rail's menus is open. It
       floats over the card's corner on the hovered card's own surface, so
       the card keeps its size and the title end it covers is masked cleanly. */
    .jb-card-rail {
      position: absolute; top: 5px; right: 5px; z-index: 1;
      display: flex; gap: 3px; padding: 2px; border-radius: 8px;
      background: ${blend(palette.hover, palette.panel, 0.75)};
      box-shadow: -8px 0 8px -4px ${blend(palette.hover, palette.panel, 0.75)};
      opacity: 0; visibility: hidden;
      transition: opacity .12s ease, visibility 0s linear .12s;
    }
    .jb-card:hover .jb-card-rail, .jb-card-pinned .jb-card-rail, .jb-sortable:focus-within .jb-card-rail {
      opacity: 1; visibility: visible; transition: opacity .12s ease;
    }
    .jb-rail-btn {
      width: 32px; height: 32px; padding: 0; box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 6px; border: 1px solid ${blend(palette.borderStrong, palette.panel, 0.7)};
      background: ${blend(palette.overlay, palette.hover, 0.5)}; color: ${palette.muted};
      font-size: 14px; cursor: pointer;
      transition: background-color .12s ease, border-color .12s ease, color .12s ease;
    }
    .jb-rail-btn:hover, .jb-rail-btn:focus-visible, .jb-rail-btn.ant-popover-open, .jb-rail-btn.ant-dropdown-open {
      background: ${blend(palette.accent, palette.panel, 0.16)};
      border-color: ${blend(palette.accent, palette.panel, 0.6)};
      color: ${palette.fg}; outline: none;
    }
    .jb-rail-btn:focus-visible { box-shadow: 0 0 0 2px ${blend(palette.accent, palette.panel, 0.5)}; }
    .jb-rail-btn:disabled { cursor: not-allowed; opacity: .5; }
    .jb-rail-danger:hover, .jb-rail-danger:focus-visible {
      background: ${blend(palette.danger, palette.panel, 0.16)};
      border-color: ${blend(palette.danger, palette.panel, 0.6)};
      color: ${palette.danger};
    }

    /* Card menus (right-click, More, Move to, Snooze): the card's 8px
       corners, the overlay surface, quiet icons, and rows that light up
       like the rest of the app's lists. The right-click menu adds the
       card's title as a header. */
    .jb-menu .ant-dropdown-menu, .jb-menu-panel {
      background: ${palette.overlay};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      box-shadow: 0 10px 28px ${palette.shadow}73, 0 0 1px ${palette.shadow}99;
    }
    .jb-menu .ant-dropdown-menu { padding: 4px; min-width: 176px; }
    .jb-menu-panel { overflow: hidden; min-width: 200px; max-width: 280px; }
    .jb-menu-panel .ant-dropdown-menu { border: none; box-shadow: none; background: transparent; border-radius: 0; padding: 4px; }
    .jb-menu-head {
      padding: 8px 12px 7px; font-size: 12px; font-weight: 600; color: ${palette.muted};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-bottom: 1px solid ${palette.border};
    }
    .jb-menu .ant-dropdown-menu-item, .jb-menu .ant-dropdown-menu-submenu-title {
      border-radius: 5px !important; padding: 5px 10px !important; min-height: 30px !important; height: auto !important;
      font-size: 13px !important; line-height: 20px !important; color: ${palette.fg};
      display: flex; align-items: center; box-sizing: border-box;
    }
    .jb-menu .ant-dropdown-menu-item:not(.ant-dropdown-menu-item-disabled):hover,
    .jb-menu .ant-dropdown-menu-item-active:not(.ant-dropdown-menu-item-disabled),
    .jb-menu .ant-dropdown-menu-submenu-title:hover,
    .jb-menu .ant-dropdown-menu-submenu-open > .ant-dropdown-menu-submenu-title {
      background: ${palette.hover} !important;
    }
    .jb-menu .ant-dropdown-menu-item-icon { font-size: 14px !important; min-width: 14px; color: ${palette.muted}; margin-inline-end: 10px !important; }
    .jb-menu .ant-dropdown-menu-item:hover .ant-dropdown-menu-item-icon,
    .jb-menu .ant-dropdown-menu-submenu-title:hover .ant-dropdown-menu-item-icon { color: ${palette.fg}; }
    .jb-menu .ant-dropdown-menu-item-danger:not(.ant-dropdown-menu-item-disabled) { color: ${palette.danger} !important; }
    .jb-menu .ant-dropdown-menu-item-danger:not(.ant-dropdown-menu-item-disabled):hover {
      background: ${blend(palette.danger, palette.overlay, 0.14)} !important; color: ${palette.danger} !important;
    }
    .jb-menu .ant-dropdown-menu-item-danger .ant-dropdown-menu-item-icon { color: ${palette.danger}; }
    .jb-menu .ant-dropdown-menu-item-disabled { color: ${palette.subtle} !important; }
    .jb-menu .ant-dropdown-menu-item-extra { margin-inline-start: 16px; font-size: 12px !important; color: ${palette.subtle} !important; }
    .jb-menu .ant-dropdown-menu-item-divider { margin: 4px 6px !important; background-color: ${palette.border} !important; }
    .jb-menu .ant-dropdown-menu-submenu-expand-icon { color: ${palette.subtle}; }
    .jb-menu-dot {
      width: 8px; height: 8px; border-radius: 4px; display: inline-block; flex: none;
      background: ${palette.muted}; margin-inline: 3px 13px;
    }
    /* Touch screens have no hover: only More shows, always, and its menu
       holds Note and Log time as well. */
    @media (hover: none) {
      .jb-card-rail { opacity: 1; visibility: visible; }
      .jb-rail-primary { display: none; }
    }

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
    /* A search box with words in it wears the same tint as an active
       filter, so it reads as applied rather than a placeholder. */
    .jb-active.ant-input, .jb-active.ant-input-affix-wrapper {
      background: ${accentTint} !important;
      border-color: ${accentEdge} !important;
    }
    .jb-active.ant-input-affix-wrapper .ant-input {
      background: transparent !important;
      color: ${palette.fg} !important;
    }
    .jb-active.ant-input-affix-wrapper .anticon { color: ${palette.fg}; }

    /* Sessions tables: each row's Delete is an icon button that appears
       on hover or keyboard focus, so rows read as data instead of a wall
       of red. Red stays on the confirmation's Delete button. Touch
       screens have no hover, so it always shows there. */
    .jb-rowdel { display: inline-flex; opacity: 0; }
    tr:hover .jb-rowdel, tr:focus-within .jb-rowdel { opacity: 1; }
    .jb-rowdel .ant-btn { color: ${palette.muted}; }
    .jb-rowdel .ant-btn:not(:disabled):hover { color: ${palette.danger} !important; }
    @media (hover: none) {
      .jb-rowdel { opacity: 1; }
    }

    /* Table row checkboxes keep their 16px box but take a 24px click
       target (WCAG 2.5.8), header checkbox included. */
    .ant-table-selection-column .ant-checkbox {
      width: 24px; height: 24px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    /* Every segmented switch (Board/Table, the dashboard's ranges, Task or
       Event ...) looks like the board toolbar's. 24px tall like the selects
       beside them: a 1px border, then a 2px gap
       on every side of the selected fill. Every option has the same height,
       padding and weight, so choosing one never moves its neighbours. */
    .ant-segmented.ant-segmented {
      padding: 2px; border: 1px solid ${palette.borderStrong}; border-radius: 6px; background: ${palette.panelDim};
    }
    .ant-segmented .ant-segmented-item { border-radius: 4px; }
    .ant-segmented.ant-segmented .ant-segmented-item-label {
      display: flex; align-items: center; justify-content: center;
      min-height: 26px; line-height: 26px; min-width: 48px; padding: 0 12px; box-sizing: border-box; font-weight: 400;
    }
    .ant-segmented .ant-segmented-item-selected, .ant-segmented .ant-segmented-thumb {
      background: ${segSelected}; box-shadow: inset 0 0 0 1px ${segSelectedEdge}; border-radius: 4px;
    }
    .ant-segmented .ant-segmented-item:not(.ant-segmented-item-selected):not(.ant-segmented-item-disabled):hover::after {
      background-color: ${blend(palette.fg, palette.panelDim, 0.07)};
    }
    /* Hairline between two options that are neither selected nor hovered. */
    .ant-segmented .ant-segmented-item + .ant-segmented-item::before {
      content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 1px;
      background: ${palette.border}; transition: opacity .12s ease; pointer-events: none;
    }
    .ant-segmented .ant-segmented-item-selected::before, .ant-segmented .ant-segmented-item-selected + .ant-segmented-item::before,
    .ant-segmented .ant-segmented-item:hover::before, .ant-segmented .ant-segmented-item:hover + .ant-segmented-item::before { opacity: 0; }
    .ant-segmented .ant-segmented-item-focused { outline: 2px solid ${palette.accent}; outline-offset: 1px; }
    .ant-segmented:focus-visible { outline: 2px solid ${palette.accent}; outline-offset: 1px; }

    /* Shared controls (theme/Toolbar.tsx). Page header and filter rows: one
       left edge, 8px between controls in a group, 16px between groups, and
       a group wraps whole. Heights are whole pixels so 1px outlines stay
       sharp at any zoom. */
    .jb-page-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 28px; margin-bottom: 10px; }
    .jb-content h1 { font-family: Georgia, serif; }
    .jb-page-title { margin: 0; font-family: Georgia, serif; font-size: 22px; line-height: 30px; font-weight: 400; letter-spacing: -0.2px; color: ${palette.fg}; white-space: nowrap; }
    .jb-content { padding: 24px !important; }
    .jb-content > div { min-width: 0; }
    .jb-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
    .jb-toolbar-group { display: flex; align-items: center; gap: 6px; flex: none; }
    .jb-toolbar-end { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    /* Small buttons and pickers share the selects' outline and padding. */
    .ant-btn-sm { padding-inline: 9px; }
    .ant-btn-sm.ant-btn-icon-only { padding-inline: 0; width: 32px; }
    .ant-btn .anticon { line-height: 0; }
    .ant-btn-sm .anticon { font-size: 12px; }
    .ant-btn-sm.ant-btn-icon-only .anticon { font-size: 14px; }
    .ant-btn-default:not(:disabled):not(.jb-active):not(.ant-btn-dangerous):not(:hover) { border-color: ${palette.borderStrong}; }
    .ant-segmented { max-width: 100%; }
    .ant-segmented .ant-segmented-item-label .anticon { font-size: 12px; margin-inline-end: 5px; }
    /* Task or Event: two equal options. */
    .jb-kind .ant-segmented-item { flex: 1 1 0; min-width: 120px; }
    /* Colour pickers: the swatch centred in its box, one size on every row. */
    .ant-color-picker-trigger { display: inline-flex !important; align-items: center; justify-content: center; padding: 0 !important; box-sizing: border-box; }
    .ant-color-picker-trigger-sm { width: 32px; height: 32px; min-width: 32px; }
    .ant-color-picker-trigger-sm .ant-color-picker-color-block { width: 16px !important; height: 16px !important; border-radius: 4px !important; }

    /* Sidebar (Sidebar.tsx). Rows, headings, footer and the name all start
       20px in; the icon rail centres everything instead. */
    .jb-sider .ant-layout-sider-children { display: flex; flex-direction: column; overflow: hidden; }
    .jb-sider-top { display: flex; align-items: center; gap: 6px; padding: 20px 10px 20px 20px; min-height: 72px; box-sizing: border-box; }
    .jb-sider-top-rail { flex-direction: column; gap: 8px; padding: 12px 0 10px; }
    .jb-sider-name { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; font-family: Georgia, serif; font-weight: 600; font-size: 19px; letter-spacing: .2px; color: ${palette.fg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .jb-brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border-radius: 8px; background: ${blend(palette.accent, palette.panel, 0.3)}; color: ${palette.accent}; font-family: sans-serif; font-size: 20px; }
    /* Small icon buttons get a click area of at least 32 x 32 px, even
       where the glyph inside is tiny. */
    .jb-hit.ant-btn { min-width: 32px; min-height: 32px; }
    .jb-nav-fold.ant-btn { color: ${palette.subtle}; }
    .jb-nav-fold.ant-btn:not(:disabled):hover { color: ${palette.fg}; background: ${blend(palette.fg, palette.panel, 0.06)}; }
    .jb-sider .ant-menu-item-group-title { padding: 14px 16px 6px 20px !important; line-height: 16px; }
    .jb-sider .ant-menu-item-group:first-child .ant-menu-item-group-title { padding-top: 6px !important; }
    .jb-nav-heading { font-size: 11px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: ${palette.subtle}; }
    .jb-nav-count { min-width: 18px; height: 16px; padding: 0 5px; border-radius: 8px; background: ${palette.accent}; color: ${palette.bg}; font-size: 11px; line-height: 16px; text-align: center; align-self: center; font-variant-numeric: tabular-nums; }
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
    /* The Add button starts where the rows' controls do (the cells' 8px). */
    .jb-lookup-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-inline: 8px; }
    .jb-lookup .ant-table-tbody > tr > td { vertical-align: middle; }
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

    /* A quiet frame groups view controls without hiding any active settings. */
    .jb-toolbar, .jb-dashboard-toolbar {
      padding: 10px 12px; border: 1px solid ${palette.border};
      border-radius: 10px; background: ${blend(palette.panel, palette.bg, 0.45)};
      gap: 10px 20px;
    }
    .jb-toolbar-group { flex-wrap: wrap; row-gap: 8px; }
    .jb-toolbar-group + .jb-toolbar-group { padding-left: 16px; border-left: 1px solid ${palette.border}; }
    .jb-settings-title { font-size: 17px; line-height: 28px; }
    .jb-settings-intro { margin-bottom: 20px; }
    .jb-settings-panel { padding: 18px; border-radius: 10px; }
    .ant-form-vertical .ant-form-item-label > label { font-weight: 600; }
    .ant-form-item-explain, .ant-form-item-extra { padding-top: 5px; }
    .ant-modal-footer { padding-top: 16px; border-top: 1px solid ${palette.border}; }
    .jb-task-panel .ant-descriptions { padding: 16px; background: ${palette.panel}; border: 1px solid ${palette.border}; border-radius: 10px; }
    .jb-task-panel .ant-descriptions-item-label { font-size: 12px; }
    .jb-task-panel .ant-divider-inner-text { font-size: 13px; font-weight: 600; }
    .ant-btn:focus-visible, .ant-select-focused .ant-select-selector, .ant-input:focus-visible {
      outline: 2px solid ${palette.accent}; outline-offset: 3px;
    }
    .ant-empty-description { color: ${palette.muted}; line-height: 1.7; }
    .ant-alert { border-radius: 8px; }
    .ant-message-notice-content { border: 1px solid ${palette.border}; }
    @media (max-width: 767px) {
      .jb-toolbar-group + .jb-toolbar-group { padding-left: 0; border-left: 0; }
      .jb-toolbar-group { max-width: 100%; }
      .jb-content { padding-inline: 16px !important; }
    }

    ${similarStyles()}

    @media (prefers-reduced-motion: reduce) {
      .jb-card, .jb-card.jb-clickable:hover, .jb-card-rail, .jb-rail-btn, .jb-sider .ant-menu-item, .jb-nav-icon { transition: none; transform: none; }
    }
  `;
}
