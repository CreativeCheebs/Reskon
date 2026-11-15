import { theme, type ThemeConfig } from "antd";
import { blend, palette } from "./palette";

// One token block for the whole app: dark surface levels from the active
// theme, compact controls, rounded corners and no button shadows. Built from
// the palette each time the theme changes. Motion is about a third of
// Ant's default (0.1/0.2/0.3s), so panels and menus open without a wait.
export const makeAntTheme = (): ThemeConfig => ({
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: {
    colorBgBase: palette.bg,
    colorBgLayout: palette.bg,
    colorBgContainer: palette.panel,
    colorBgElevated: palette.overlay,
    colorBgSpotlight: palette.overlay,
    colorBorder: palette.borderStrong,
    colorBorderSecondary: palette.border,
    colorSplit: palette.border,
    colorText: palette.fg,
    colorTextSecondary: palette.muted,
    colorTextTertiary: palette.subtle,
    colorTextPlaceholder: palette.subtle,
    colorTextDescription: palette.muted,
    colorPrimary: palette.accent,
    colorInfo: palette.accent,
    colorSuccess: palette.success,
    colorWarning: palette.warn,
    colorError: palette.danger,
    colorLink: palette.accent,
    controlItemBgHover: palette.hover,
    controlItemBgActive: palette.selected,
    controlItemBgActiveHover: palette.selected,
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 10,
    controlHeight: 28,
    controlHeightSM: 24,
    controlHeightLG: 30,
    fontSize: 13,
    motionDurationFast: "0.05s",
    motionDurationMid: "0.08s",
    motionDurationSlow: "0.12s",
    boxShadow: "none",
    boxShadowSecondary: `0 8px 12px ${palette.shadow}40, 0 0 1px ${palette.shadow}80`,
  },
  components: {
    Button: { primaryShadow: "none", defaultShadow: "none", dangerShadow: "none", primaryColor: palette.bg },
    Table: {
      cellPaddingBlockSM: 5,
      cellPaddingInlineSM: 8,
      headerBg: palette.panel,
      headerColor: palette.muted,
      rowHoverBg: palette.hover,
      borderColor: palette.border,
    },
    // The sidebar sits one step up from the page so it reads as its own
    // surface. Hover is a neutral wash; selected is an accent tint, so a
    // hovered row never looks like a second selection.
    Layout: { siderBg: palette.panel, headerBg: palette.bg, bodyBg: palette.bg, triggerBg: palette.panel },
    Menu: {
      darkItemBg: palette.panel,
      darkSubMenuItemBg: palette.panel,
      darkItemColor: palette.muted,
      darkItemHoverColor: palette.fg,
      darkItemHoverBg: blend(palette.fg, palette.panel, 0.06),
      darkItemSelectedBg: blend(palette.accent, palette.panel, 0.18),
      darkItemSelectedColor: palette.fg,
      darkGroupTitleColor: palette.subtle,
      darkItemDisabledColor: palette.subtle,
      itemHeight: 32,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      itemBorderRadius: 7,
      iconSize: 16,
      collapsedIconSize: 16,
      iconMarginInlineEnd: 10,
    },
    Drawer: { colorBgElevated: palette.overlay },
    Modal: { contentBg: palette.overlay, headerBg: palette.overlay, footerBg: palette.overlay },
    // The chosen option: a clear accent tint with full-strength text.
    Segmented: {
      itemSelectedBg: blend(palette.accent, palette.bg, 0.32),
      itemSelectedColor: palette.fg,
      itemColor: palette.muted,
      itemHoverColor: palette.fg,
      trackBg: palette.panelDim,
    },
    Tabs: { itemColor: palette.muted },
    Tag: { defaultBg: palette.hover, defaultColor: palette.fg },
    Select: { optionSelectedBg: palette.selected },
  },
});
