import { useState } from "react";
import { Modal, Radio, Select, Space } from "antd";
import { message } from "../theme/feedback";
import { api, ApiError } from "../api";
import { useApp } from "../store";

// Deleting something that is still in use (a status, priority, area,
// energy type or subtype): the server refuses and says what uses it, and
// this asks where those should move (or, for priorities, clear it). The
// same for every kind, as in Jira. Something nothing uses is deleted
// straight away: the first DELETE simply succeeds.

type Collection = "statuses" | "priorities" | "areas" | "energy-types" | "subtypes";

const NOUN: Record<Collection, string> = {
  statuses: "status",
  priorities: "priority",
  areas: "area",
  "energy-types": "energy type",
  subtypes: "subtype",
};

interface Props {
  collection: Collection;
  row: { id: number; name: string };
  allowClear: boolean;
  onDone: () => void;
}

export function useReassignDelete(collection: Collection, allowClear: boolean) {
  const { reloadBootstrap } = useApp();
  const [pending, setPending] = useState<{ id: number; name: string; count: number; usedBy?: string } | null>(null);

  const start = async (row: { id: number; name: string }) => {
    try {
      await api.del(`/${collection}/${row.id}`);
      await reloadBootstrap();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const cur = e.current as { task_count: number; used_by?: string };
        setPending({ ...row, count: cur.task_count, usedBy: cur.used_by });
      } else {
        message.error((e as Error).message);
      }
    }
  };

  const dialog = pending && (
    <ReassignDialog
      collection={collection}
      row={pending}
      count={pending.count}
      usedBy={pending.usedBy}
      allowClear={allowClear}
      onDone={() => setPending(null)}
    />
  );
  return { start, dialog };
}

function ReassignDialog({ collection, row, count, usedBy, allowClear, onDone }: Props & { count: number; usedBy?: string }) {
  const { boot, reloadBootstrap } = useApp();
  const all: { id: number; name: string }[] = {
    statuses: boot.statuses,
    priorities: boot.priorities,
    areas: boot.areas,
    "energy-types": boot.energy_types,
    subtypes: boot.subtypes,
  }[collection];
  const rows = all.filter((r) => r.id !== row.id);
  const [mode, setMode] = useState<"move" | "clear">("move");
  const [target, setTarget] = useState<number | undefined>(rows[0]?.id);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const q = mode === "clear" ? "clear=true" : `reassign_to=${target}`;
      await api.del(`/${collection}/${row.id}?${q}`);
      await reloadBootstrap();
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Delete “${row.name}”`}
      okText="Delete and move them"
      okButtonProps={{ danger: true, loading: busy, disabled: mode === "move" && !target }}
      onOk={confirm}
      onCancel={onDone}
    >
      <p>
        {usedBy
          ? `This ${NOUN[collection]} is used by ${usedBy}. Pick where they should move.`
          : `${count} task${count === 1 ? "" : "s"} ${count === 1 ? "uses" : "use"} this ${NOUN[collection]}.`}
        {collection === "statuses" && " Each move is written to the task's history and its time in status restarts."}
      </p>
      <Space direction="vertical">
        {allowClear && (
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio value="move">Move to another</Radio>
            <Radio value="clear">Clear it</Radio>
          </Radio.Group>
        )}
        {mode === "move" && (
          <Select style={{ width: 240 }} value={target} onChange={setTarget} options={rows.map((r) => ({ value: r.id, label: r.name }))} />
        )}
      </Space>
    </Modal>
  );
}
