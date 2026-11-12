import { Fragment } from "react";
import { Tooltip } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { formatDateTime, formatSpan } from "../format";
import { blend, palette } from "../theme/palette";
import type { Segment } from "../types";
import { useTerms } from "../terms";

// A task's path through its statuses as blocks joined by arrows:
// To do (3d 3h) → In progress (5h, now). One block per stretch in a status,
// in order, straight from the server's segments. Wraps on a narrow panel.

export function CycleFlow({ segments }: { segments: Segment[] }) {
  const { statusById } = useApp();
  const T = useTerms();
  const total = segments.reduce((n, s) => n + s.hours, 0);
  if (segments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 6px" }}>
      {segments.map((s, i) => {
        const status = statusById.get(s.status_id);
        const color = status?.color ?? palette.borderStrong;
        return (
          <Fragment key={i}>
            {i > 0 && <ArrowRightOutlined aria-hidden style={{ color: palette.subtle, fontSize: 11 }} />}
            <Tooltip
              title={
                <div style={{ fontSize: 12 }}>
                  {formatDateTime(s.from)} → {s.current ? "now" : formatDateTime(s.to)}
                  {total > 0 && <div>{Math.round((s.hours / total) * 100)}% of this {T.task}'s time so far</div>}
                </div>
              }
            >
              <div
                aria-label={`${status?.name ?? "Deleted status"}: ${formatSpan(s.hours)}${s.current ? ", current" : ""}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  padding: "4px 10px 5px",
                  borderRadius: 6,
                  background: blend(color, palette.panel, 0.18),
                  border: `1px solid ${s.current ? color : blend(color, palette.panel, 0.45)}`,
                  borderLeft: `3px solid ${color}`,
                  minWidth: 64,
                }}
              >
                <span style={{ fontSize: 11, color: palette.muted, whiteSpace: "nowrap" }}>
                  {status?.name ?? "deleted status"}
                  {s.current && <span style={{ color, fontWeight: 600 }}> · now</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: palette.fg, whiteSpace: "nowrap" }}>{formatSpan(s.hours)}</span>
              </div>
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}
