import { useState } from "react";
import { Button, InputNumber, Popover, Space, Typography } from "antd";
import { palette } from "../theme/palette";
import { filterOf } from "../views/cardConfig";
import { useSaveView } from "../views/useViewState";
import type { View } from "../types";

// Foot of a done column: how long finished cards stay on this board (the
// view filter's include_done_days, applied on the server), changeable here.

export function DoneWindow({ view, disabled }: { view: View; disabled: boolean }) {
  const save = useSaveView(view);
  const days = filterOf(view).include_done_days;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(days);

  const apply = (v: number | null) => {
    save({ filter: { ...view.filter, include_done_days: v } });
    setOpen(false);
  };

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        if (o) setDraft(days);
        setOpen(o);
      }}
      title="Hide finished tasks"
      content={
        <div style={{ width: 230 }}>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            Tasks finished longer ago than this drop off this view. They are not deleted.
          </Typography.Paragraph>
          <Space.Compact style={{ width: "100%" }}>
            <InputNumber
              size="small"
              min={0}
              style={{ width: "100%" }}
              value={draft}
              placeholder="never hide"
              onChange={(v) => setDraft(v)}
              aria-label="Days before a finished task is hidden"
            />
            <Button size="small" disabled>
              days
            </Button>
          </Space.Compact>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <Button size="small" type="text" onClick={() => apply(null)}>
              Never hide
            </Button>
            <Button size="small" type="primary" onClick={() => apply(draft)}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <Button size="small" type="text" block disabled={disabled} style={{ color: palette.subtle, fontSize: 12, height: 24 }}>
        {days === null ? "Finished tasks stay shown" : days === 0 ? "Finished tasks are hidden" : `Hidden ${days} day${days === 1 ? "" : "s"} after done`}
      </Button>
    </Popover>
  );
}
