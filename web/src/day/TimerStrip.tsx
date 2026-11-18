import { useEffect, useState } from "react";
import { Button, Popconfirm } from "antd";
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { clock, elapsedNow } from "./plan";
import type { TimerList, TimerRow } from "./types";

/** Now, ticking every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export interface TimerHandlers {
  onPause: (t: TimerRow) => void;
  onResume: (t: TimerRow) => void;
  onStop: (t: TimerRow) => void;
  /** Open a stopped timer's session for review. */
  onReview: (t: TimerRow) => void;
  /** Throw the time away. */
  onDiscard: (t: TimerRow) => void;
  /** A timer call is in flight: the buttons wait. */
  busy?: boolean;
}

/**
 * The running, paused and stopped timers. The server keeps the real clock, so
 * this survives closing the app; the screen only ticks on from the moment it
 * read the elapsed time. A stopped timer waits to be reviewed and saved, or
 * discarded. Two running timers (a phone that was offline) are both shown, and
 * each is stopped on its own.
 */
export function TimerStrip({ list, fetchedAt, handlers: h }: { list: TimerList; fetchedAt: number; handlers: TimerHandlers }) {
  const { online } = useApp();
  const now = useNow(list.timers.some((t) => t.running));
  if (list.timers.length === 0) return null;
  const off = !online || !!h.busy;
  return (
    <section aria-label="Timers" style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {list.conflict && (
        <div role="alert" style={{ color: palette.warn, fontSize: 12 }}>
          Two timers ran at the same time. Stop each one on its own and check the times before saving.
        </div>
      )}
      {list.timers.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: t.running ? palette.success : t.stopped ? palette.warn : palette.subtle }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong>{t.title}</strong>{" "}
            <span style={{ color: palette.muted, fontSize: 12 }}>
              {t.kind === "event" ? "event" : "task"}
              {t.stopped ? " · Stopped — review" : t.running ? "" : " · paused"}
            </span>
          </span>
          <span role="timer" aria-label={`Elapsed on ${t.title}`} style={{ fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 600 }}>
            {clock(elapsedNow(t, fetchedAt, now))}
          </span>
          {t.stopped ? (
            <Button size="small" type="primary" disabled={off} onClick={() => h.onReview(t)} aria-label={`Review and save the time on ${t.title}`}>
              Review
            </Button>
          ) : (
            <>
              {t.running ? (
                <Button size="small" icon={<PauseCircleOutlined />} disabled={off} onClick={() => h.onPause(t)} aria-label={`Pause timer on ${t.title}`}>
                  Pause
                </Button>
              ) : (
                <Button size="small" icon={<PlayCircleOutlined />} disabled={off} onClick={() => h.onResume(t)} aria-label={`Resume timer on ${t.title}`}>
                  Resume
                </Button>
              )}
              <Button size="small" type="primary" icon={<StopOutlined />} disabled={off} onClick={() => h.onStop(t)} aria-label={`Stop timer on ${t.title} and review the session`}>
                Stop
              </Button>
            </>
          )}
          <Popconfirm title="Throw this time away without saving?" okText="Discard time" onConfirm={() => h.onDiscard(t)}>
            <Button size="small" type="text" disabled={off} aria-label={`Discard time on ${t.title}`}>
              Discard time
            </Button>
          </Popconfirm>
        </div>
      ))}
    </section>
  );
}
