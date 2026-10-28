import { theme, type ThemeConfig } from "antd";
import { palette } from "./palette";

// One token block for the whole app: dark, dense, 6px radii, 24–30px
// controls, no button shadows, #303036 borders.
export const antTheme: ThemeConfig = {
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: {
    colorBgBase: palette.bg,
    colorBgLayout: palette.bg,
    colorBgContainer: palette.panel,
    colorBgElevated: palette.panel,
    colorBorder: "#303036",
    colorBorderSecondary: palette.border,
    colorText: palette.fg,
    colorTextSecondary: palette.muted,
    colorPrimary: palette.accent,
    colorWarning: palette.warn,
    colorError: palette.danger,
    colorLink: palette.accent,
    borderRadius: 6,
    borderRadiusSM: 6,
    borderRadiusLG: 6,
    controlHeight: 28,
    controlHeightSM: 24,
    controlHeightLG: 30,
    fontSize: 13,
    boxShadow: "none",
    boxShadowSecondary: "0 4px 16px rgba(0,0,0,0.5)",
  },
  components: {
    Button: { primaryShadow: "none", defaultShadow: "none", dangerShadow: "none" },
    Table: {
      cellPaddingBlockSM: 4,
      cellPaddingInlineSM: 8,
      headerBg: palette.panelDim,
      rowHoverBg: "#1c1c1f",
    },
    Layout: { siderBg: palette.panelDim, headerBg: palette.bg, bodyBg: palette.bg },
    Menu: { darkItemBg: palette.panelDim, itemHeight: 30 },
    Drawer: { colorBgElevated: palette.panel },
    Modal: { contentBg: palette.panel, headerBg: palette.panel },
  },
};
