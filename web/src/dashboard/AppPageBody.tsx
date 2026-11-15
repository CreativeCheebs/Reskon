import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spin } from "antd";
import { api } from "../api";
import type { PageLink } from "../apps/types";
import { pluginTheme } from "../apps/pluginTheme";
import { useTheme } from "../theme/ThemeProvider";
import { palette } from "../theme/palette";
import type { Widget } from "./types";

// An app page widget's body: the app's own page in a walled-off frame
// (docs/plugins.md section 4). Reskon's server asks the app for a
// one-minute, single-use ticket each time the page is shown, so every
// load (and every Refresh) launches again; nothing here ever sees the app's
// token. Reskon data changes do not reload it: they mean nothing to the
// app's page, and each load spends a ticket.

/** What the frame may do. Scripts and forms so the page works, its own
 *  origin so it can call its own server (safe only because it is never
 *  Reskon's origin, checked here and on the server), and pop-ups that leave
 *  the sandbox so its target="_blank" links open normally (Reskon's
 *  Cross-Origin-Opener-Policy keeps such a tab from reaching Reskon's tab).
 *  Never top navigation. */
const SANDBOX = "allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox";

interface Frame {
  src: string;
  origin: string;
  /** Changes on every launch, so Refresh makes a new frame. A new address
   *  that differs only after "#" would not reload the page by itself. */
  n: number;
}

/** The page's origin, if the server's answer can be shown: http(s) only,
 *  the origin the server reported, and never Reskon's own. */
function checkedOrigin(link: PageLink): { origin: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(link.url);
  } catch {
    return { error: "The app sent an address Reskon cannot open." };
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.origin !== link.origin) {
    return { error: "The app sent an address Reskon cannot open." };
  }
  // On Reskon's own address the sandbox would not hold: the page could
  // reach Reskon's data with your sign-in.
  if (u.origin === window.location.origin) {
    return { error: "This app is on Reskon's own address, so Reskon will not show its page." };
  }
  return { origin: u.origin };
}

export function AppPageBody({
  widget,
  loads,
  editing,
  onLoading,
}: {
  widget: Widget;
  loads: number;
  editing: boolean;
  /** Told when a launch starts and ends, so the Refresh button can spin. */
  onLoading?: (loading: boolean) => void;
}) {
  // Read here so a theme switch reaches this component through the memo above it.
  const { theme } = useTheme();
  const [frame, setFrame] = useState<Frame | null>(null);
  // Set once the frame has loaded its page: messages sent before that would
  // reach the blank page the frame starts with, and the browser complains.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const ref = useRef<HTMLIFrameElement>(null);
  const query = JSON.stringify(widget.query);
  const launches = useRef(0);
  const loadingRef = useRef(onLoading);
  loadingRef.current = onLoading;

  useEffect(() => {
    // Only the newest launch counts: a slow older answer, or one arriving
    // after the widget is gone, must not be applied.
    let current = true;
    const n = ++launches.current;
    setFrame(null);
    setLoaded(false);
    setError(null);
    loadingRef.current?.(true);
    api
      .post<PageLink>("/apps/launch", { widget: widget.id })
      .then((link) => {
        if (!current) return;
        const checked = checkedOrigin(link);
        if ("error" in checked) {
          setError(checked.error);
          return;
        }
        const theme = "theme=" + encodeURIComponent(JSON.stringify(pluginTheme()));
        setFrame({ src: link.url + (link.url.includes("#") ? "&" : "#") + theme, origin: checked.origin, n });
      })
      .catch((e) => current && setError((e as Error).message))
      .finally(() => current && loadingRef.current?.(false));
    return () => {
      current = false;
      loadingRef.current?.(false);
    };
  }, [widget.id, query, loads, retries]);

  // The colours go to the page's own origin only, never "*".
  const sendTheme = useCallback(() => {
    if (frame && loaded) ref.current?.contentWindow?.postMessage({ reskon: 1, type: "theme", theme: pluginTheme() }, frame.origin);
  }, [frame, loaded]);
  useEffect(sendTheme, [theme, sendTheme]);

  if (error) {
    return (
      <div role="alert" style={{ color: palette.muted, fontSize: 12, padding: 12 }}>
        {error}
        <br />
        <Button size="small" onClick={() => setRetries((r) => r + 1)} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </div>
    );
  }
  if (!frame) {
    return (
      <div role="status" aria-label="Loading widget" style={{ display: "grid", placeItems: "center", flex: 1 }}>
        <Spin size="small" />
      </div>
    );
  }
  return (
    <iframe
      key={frame.n}
      ref={ref}
      src={frame.src}
      title={widget.title || "App page"}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      // The first load sends the theme through the effect above; a later
      // load (the page moved on inside the frame) sends it again.
      onLoad={() => (loaded ? sendTheme() : setLoaded(true))}
      // While widgets are moved, the frame must not swallow the mouse or the Tab key.
      tabIndex={editing ? -1 : undefined}
      style={{ flex: 1, minHeight: 0, width: "100%", border: 0, background: "transparent", pointerEvents: editing ? "none" : undefined }}
    />
  );
}
