import { useState } from "react";
import { Modal, Radio, Select, Space } from "antd";
import { message } from "../theme/feedback";
import { api, ApiError } from "../api";
import { useApp } from "../store";

// Deleting a status or priority that tasks still use: pick where those
// tasks go (or, for priorities, clear it). A status with no tasks skips the
// dialog — the first DELETE simply succeeds.

interface Props {
  collection: "statuses" | "priorities";
  row: { id: number; name: string };
  allowClear: boolean;
  onDone: () => void;
}

export function useReassignDelete(collection: "statuses" | "priorities", allowClear: boolean) {
  const { reloadBootstrap } = useApp();
  const [pending, setPending] = useState<{ id: number; name: string; count: number } | null>(null);

  const start = async (row: { id: number; name: string }) => {
    try {
      await api.del(`/${collection}/${row.id}`);
      await reloadBootstrap();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const count = (e.current as { task_count: number }).task_count;
        setPending({ ...row, count });
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
      allowClear={allowClear}
      onDone={() => setPending(null)}
    />
  );
  return { start, dialog };
}

function ReassignDialog({ collection, row, count, allowClear, onDone }: Props & { count: number }) {
  const { boot, reloadBootstrap } = useApp();
  const rows = (collection === "statuses" ? boot.statuses : boot.priorities).filter((r) => r.id !== row.id);
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
      okText="Delete and move tasks"
      okButtonProps={{ danger: true, loading: busy, disabled: mode === "move" && !target }}
      onOk={confirm}
      onCancel={onDone}
    >
      <p>
        {count} task{count === 1 ? "" : "s"} {count === 1 ? "uses" : "use"} this {collection === "statuses" ? "status" : "priority"}.
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
