import { useRef, useState } from "react";
import type { Dayjs } from "dayjs";
import { Button, DatePicker, Divider, Popover, Select, Space, Tooltip } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { confirm, message } from "../theme/feedback";
import { palette } from "../theme/palette";
import { DifficultySlider } from "../task/DifficultySlider";
import { useTerms } from "../terms";

// Actions on the selected sessions. Each one is a single all-or-nothing
// request (POST /api/sessions/bulk).

export function BulkBar({
  ids,
  tasks,
  onDone,
  onClear,
}: {
  ids: number[];
  tasks: { id: number; title: string; key: string }[];
  onDone: () => void;
  onClear: () => void;
}) {
  const { boot } = useApp();
  const T = useTerms();
  const [busy, setBusy] = useState(false);
  const running = useRef(false); // a second action never starts while one runs
  const [diff, setDiff] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs | null>(null);
  const n = ids.length;
  const plural = `${n} session${n === 1 ? "" : "s"}`;

  const run = async (body: Record<string, unknown>, done: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await api.post("/sessions/bulk", { ids, ...body });
      message.success(done);
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const set = (fields: Record<string, unknown>, what: string) => run({ set: fields }, `${what} on ${plural}`);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 12,
        background: palette.selected,
        border: `1px solid ${palette.accent}`,
        borderRadius: 6,
      }}
    >
      <span style={{ fontWeight: 600 }}>{plural} selected</span>
      <Divider type="vertical" />
      <Select
        size="small"
        placeholder="Energy type…"
        aria-label="Set the energy type of the selected sessions"
        style={{ width: 150 }}
        value={null}
        disabled={busy}
        onChange={(v: number) => set({ energy_type_id: v }, `Energy type set to ${boot.energy_types.find((e) => e.id === v)?.name}`)}
        options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
      />
      <Select
        size="small"
        placeholder="Kind…"
        aria-label="Set the kind of the selected sessions"
        style={{ width: 120 }}
        value={null}
        disabled={busy}
        onChange={(v: string) => set({ kind: v }, `Marked as ${v === "event" ? "event" : T.task}`)}
        options={[
          { value: "task", label: T.Task },
          { value: "event", label: "Event" },
        ]}
      />
      <Select
        size="small"
        placeholder="Area…"
        aria-label="Set the area of the selected sessions"
        style={{ width: 130 }}
        value={null}
        disabled={busy}
        onChange={(v: number) => set({ area_id: v === 0 ? null : v }, v === 0 ? "Area cleared" : `Area set to ${boot.areas.find((a) => a.id === v)?.name}`)}
        options={[...boot.areas.map((a) => ({ value: a.id, label: a.name })), { value: 0, label: "No area" }]}
      />
      <Popover
        trigger="click"
        content={
          <Space direction="vertical">
            <DifficultySlider value={diff} width={260} onChange={setDiff} />
            <Space>
              <WriteButton size="small" type="primary" disabled={busy} onClick={() => set({ difficulty: diff }, diff ? `Level set to ${diff}` : "Level cleared")}>
                Apply to {plural}
              </WriteButton>
            </Space>
          </Space>
        }
      >
        <Button size="small" disabled={busy}>
          Level…
        </Button>
      </Popover>
      <Popover
        trigger="click"
        content={
          <Space>
            <DatePicker size="small" value={date} onChange={(d: Dayjs | null) => setDate(d)} />
            <WriteButton
              size="small"
              type="primary"
              disabled={busy || !date}
              onClick={() => date && set({ logged_for: date.format("YYYY-MM-DD") }, `Moved to ${date.format("D MMM YYYY")}`)}
            >
              Move {plural}
            </WriteButton>
          </Space>
        }
      >
        <Button size="small" disabled={busy}>
          Move to date…
        </Button>
      </Popover>
      <Tooltip title="Work out their points again at today's rates (after a rate change)">
        <span>
          <WriteButton size="small" disabled={busy} onClick={() => set({ recalculate: true }, "Points recalculated")}>
            Recalculate points
          </WriteButton>
        </span>
      </Tooltip>
      <Select
        size="small"
        showSearch
        placeholder={`Attach to ${T.task}…`}
        aria-label={`Attach the selected sessions to ${T.task}`}
        style={{ width: 220 }}
        value={null}
        disabled={busy}
        optionFilterProp="search"
        onChange={(v: number) => set({ task_id: v }, `Attached to ${tasks.find((t) => t.id === v)?.title}`)}
        options={tasks.map((t) => ({ value: t.id, label: `${t.key} · ${t.title}`, search: `${t.key} ${t.title}`.toLowerCase() }))}
      />
      <WriteButton size="small" disabled={busy} onClick={() => set({ task_id: null }, `Detached from their ${T.tasks}`)}>
        Detach
      </WriteButton>
      <WriteButton
        size="small"
        danger
        disabled={busy}
        onClick={() =>
          confirm({
            title: `Delete ${plural}?`,
            content: "They can be restored from a backup, but not from the app.",
            okText: "Delete",
            okButtonProps: { danger: true },
            onOk: () => run({ delete: true }, `Deleted ${plural}`),
          })
        }
      >
        Delete
      </WriteButton>
      <div style={{ flex: 1 }} />
      <Button size="small" type="text" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
