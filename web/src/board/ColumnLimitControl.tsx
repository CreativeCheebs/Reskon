import { useState } from "react";
import { Button, InputNumber, Popover, Segmented, Space, Tooltip, Typography } from "antd";
import { palette } from "../theme/palette";
import type { ColumnLimit } from "../types";
import { formatLimit, limitUnits } from "./limits";
import { useTerms } from "../terms";

// A column's limit in its header: "3/5" coloured by how full the column is,
// and a popover to set, change or remove it. Saved on the view at once.

export function ColumnLimitControl({
  statusName,
  limit,
  use,
  disabled,
  onChange,
}: {
  statusName: string;
  limit: ColumnLimit | undefined;
  use: number;
  disabled: boolean;
  onChange: (limit: ColumnLimit | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const T = useTerms();
  const [draft, setDraft] = useState<ColumnLimit>(limit ?? { max: 5, unit: "tasks", hard: false });
  const over = limit ? use > limit.max : false;
  const full = limit ? use >= limit.max : false;
  const color = over ? (limit?.hard ? palette.danger : palette.warn) : full ? palette.warn : palette.subtle;

  const form = (
    <div style={{ width: 240 }}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Count
          </Typography.Text>
          <Segmented
            block
            size="small"
            value={draft.unit}
            onChange={(v) => setDraft((d) => ({ ...d, unit: v as ColumnLimit["unit"] }))}
            options={limitUnits(T)}
          />
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            At most
          </Typography.Text>
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            min={draft.unit === "tasks" ? 1 : 0.5}
            step={draft.unit === "tasks" ? 1 : 0.5}
            value={draft.max}
            onChange={(v) => v !== null && setDraft((d) => ({ ...d, max: v }))}
            aria-label="Limit"
          />
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            When it's passed
          </Typography.Text>
          <Segmented
            block
            size="small"
            value={draft.hard ? "hard" : "soft"}
            onChange={(v) => setDraft((d) => ({ ...d, hard: v === "hard" }))}
            options={[
              { value: "soft", label: "Show it" },
              { value: "hard", label: "Ask first" },
            ]}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {limit ? (
            <Button
              size="small"
              danger
              type="text"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Remove limit
            </Button>
          ) : (
            <span />
          )}
          <Button
            size="small"
            type="primary"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </Space>
    </div>
  );

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        if (o) setDraft(limit ?? { max: 5, unit: "tasks", hard: false });
        setOpen(o);
      }}
      title={`${statusName} limit`}
      content={form}
    >
      {limit ? (
        <Tooltip
          title={`${formatLimit(use, limit.unit)} of ${formatLimit(limit.max, limit.unit)} · ${limit.hard ? "asks before going over" : "soft limit"}. Click to change.`}
          mouseEnterDelay={0.4}
        >
          {/* The pill stays small; the button around it is the 32px click area. */}
          <Button
            size="small"
            type="text"
            className="jb-hit"
            aria-label={`${statusName} limit: ${formatLimit(use, limit.unit)} of ${formatLimit(limit.max, limit.unit)}`}
            style={{ padding: "0 4px" }}
          >
            <span
              style={{
                fontSize: 11,
                lineHeight: "16px",
                padding: "0 5px",
                borderRadius: 3,
                color: over || full ? palette.bg : color,
                background: over || full ? color : "transparent",
                border: `1px solid ${over || full ? color : palette.border}`,
              }}
            >
              {formatLimit(use, limit.unit).replace(" pts", "")}/{formatLimit(limit.max, limit.unit)}
            </span>
          </Button>
        </Tooltip>
      ) : (
        <Tooltip title="Set a limit for this column" mouseEnterDelay={0.5}>
          <Button size="small" type="text" disabled={disabled} className="jb-hit" aria-label={`Set a limit for ${statusName}`} style={{ color: palette.subtle, padding: "0 4px" }}>
            ≤
          </Button>
        </Tooltip>
      )}
    </Popover>
  );
}
