import { useState } from "react";
import { Switch, Typography } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { showDayScreen } from "../day/enabled";
import { palette } from "../theme/palette";

// The `show_day_screen` setting: whether the Day screen is offered in the
// sidebar here and in the phone's tabs. It is one setting on the account, so
// both agree. Turning it off hides the screen; nothing is deleted. Saves on change.

export function ScreensSettings() {
  const { boot, saveSetting, online } = useApp();
  const [on, setOn] = useState(showDayScreen(boot.settings));
  const change = (v: boolean) => {
    const before = on;
    setOn(v);
    autosave(saveSetting("show_day_screen", v)).catch(() => setOn(before));
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 16px",
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
          background: palette.panel,
        }}
      >
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
    </div>
  );
}
