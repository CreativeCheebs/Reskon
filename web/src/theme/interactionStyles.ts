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

    .jb-sider .ant-menu-item .jb-nav-icon { color: ${palette.muted}; transition: color .12s ease; }
    .jb-sider .ant-menu-item-selected .jb-nav-icon { color: ${palette.accent}; }
    .jb-sider .ant-menu-item-selected { font-weight: 600; }

    .jb-add-task.ant-btn { color: ${palette.muted}; }
    .jb-add-task.ant-btn:not(:disabled):hover { color: ${palette.fg}; background: ${palette.hover}; }

    @media (prefers-reduced-motion: reduce) {
      .jb-card, .jb-card.jb-clickable:hover, .jb-sider .ant-menu-item .jb-nav-icon { transition: none; transform: none; }
    }
  `;
}
