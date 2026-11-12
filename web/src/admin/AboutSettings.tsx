import { Typography } from "antd";
import { APP_NAME_VERSION } from "../version";
import { palette } from "../theme/palette";

// Which Reskon this is. The web app is served by the server it was built
// with, so the number is the server's too.

export function AboutSettings() {
  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Text strong style={{ fontSize: 16 }}>
        {APP_NAME_VERSION}
      </Typography.Text>
      <Typography.Paragraph style={{ color: palette.muted, fontSize: 13, margin: "8px 0 0" }}>
        This web app and the server it comes from always have the same version. The phone app shows its own version in its Settings, and which server it is connected to.
      </Typography.Paragraph>
    </div>
  );
}
