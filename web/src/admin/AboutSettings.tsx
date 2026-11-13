import { useEffect, useState } from "react";
import { Typography } from "antd";
import { APP_NAME_VERSION } from "../version";
import { palette } from "../theme/palette";

// Which Reskon this is. The web app is served by the server it was built
// with, so the number is the server's too.

/** "13 Nov 2026" from the server's year-month-day; nothing if it is not one. */
export function updatedLabel(day: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function AboutSettings() {
  // The server says when it was last updated; an older server does not, and then nothing is shown.
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h: { updated?: string }) => live && setUpdated(updatedLabel(h.updated)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Text strong style={{ fontSize: 16 }}>
        {APP_NAME_VERSION}
      </Typography.Text>
      {updated && <Typography.Paragraph style={{ margin: "4px 0 0" }}>Updated {updated}</Typography.Paragraph>}
      <Typography.Paragraph style={{ color: palette.muted, fontSize: 13, margin: "8px 0 0" }}>
        This web app and the server it comes from always have the same version. The phone app shows its own version in its Settings, and which server it is connected to.
      </Typography.Paragraph>
    </div>
  );
}
