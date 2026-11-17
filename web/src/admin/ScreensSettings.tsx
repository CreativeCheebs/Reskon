import { useState } from "react";
import { Segmented, Switch, Typography } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { showDayScreen } from "../day/enabled";
import { palette } from "../theme/palette";

// The `show_day_screen` setting: whether the Day screen is offered in the
// sidebar here and in the phone's tabs. It is one setting on the account, so
// both agree. Turning it off hides the screen; nothing is deleted. Saves on change.
// The `dashboard_toolbar` setting: whether the dashboard's toolbar sits along
// the top (the default) or down the left side. Web only.

const card = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 16px",
  border: `1px solid ${palette.border}`,
  borderRadius: 8,
  background: palette.panel,
} as const;

export function ScreensSettings() {
  const { boot, saveSetting, online } = useApp();
  const [on, setOn] = useState(showDayScreen(boot.settings));
  const [toolbar, setToolbar] = useState<"top" | "left">(boot.settings.dashboard_toolbar === "left" ? "left" : "top");
  const change = (v: boolean) => {
    const before = on;
    setOn(v);
    autosave(saveSetting("show_day_screen", v)).catch(() => setOn(before));
  };
  const changeToolbar = (v: "top" | "left") => {
    const before = toolbar;
    setToolbar(v);
    autosave(saveSetting("dashboard_toolbar", v)).catch(() => setToolbar(before));
  };

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ flex: 1 }}>
          <Typography.Text strong id="screens-day-label">
            Day screen
          </Typography.Text>
          <div style={{ color: palette.muted, fontSize: 13, marginTop: 2 }}>
            The morning plan and the evening readout. Off hides it from the sidebar here and from the phone's tabs. Nothing is deleted.
          </div>
        </div>
        <Switch aria-labelledby="screens-day-label" checked={on} disabled={!online} onChange={change} />
      </div>
      <div style={card}>
        <div style={{ flex: 1 }}>
          <Typography.Text strong id="screens-toolbar-label">
            Dashboard toolbar position
          </Typography.Text>
          <div style={{ color: palette.muted, fontSize: 13, marginTop: 2 }}>
            Where the dashboard's tabs, dates and Edit button sit: along the top, or down the left side to give the widgets more height.
          </div>
        </div>
        <Segmented
          aria-labelledby="screens-toolbar-label"
          value={toolbar}
          disabled={!online}
          onChange={(v) => changeToolbar(v as "top" | "left")}
          options={[
            { value: "top", label: "Top" },
            { value: "left", label: "Left" },
          ]}
        />
      </div>
    </div>
  );
}
