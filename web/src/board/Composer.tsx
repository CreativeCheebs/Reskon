import { useState } from "react";
import { Input, Select, Space, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { local, WriteButton } from "../offline";
import { filterOf } from "../views/cardConfig";
import type { Task, View } from "../types";

const LAST_AREA = "jitterbug.lastAreaId";

/** Areas a new task in this view may belong to. One area in the view's
 *  filter means no picker; several (or "all") means a picker. */
export function useAreaChoice(view: View | undefined) {
  const { boot } = useApp();
  const allowed = view ? filterOf(view).areas : null;
  const areas = boot.areas.filter((a) => !allowed || allowed.includes(a.id));
  const last = Number(local.get(LAST_AREA));
  const preselect = areas.find((a) => a.id === last)?.id ?? areas[0]?.id;
  return { areas, preselect, remember: (id: number) => local.set(LAST_AREA, String(id)) };
}

/** Inline "add task" at the bottom of a board column. */
export function Composer({ statusId, view, onCreated }: { statusId: number; view: View; onCreated: (t: Task) => void }) {
  const { online } = useApp();
  const { areas, preselect, remember } = useAreaChoice(view);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState<number | undefined>(preselect);
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <WriteButton type="text" size="small" block onClick={() => setOpen(true)} style={{ justifyContent: "flex-start" }}>
        + Add task
      </WriteButton>
    );

  const submit = async () => {
    const area = areas.length === 1 ? areas[0].id : areaId;
    if (!title.trim() || !area) return;
    setBusy(true);
    try {
      const t = await api.post<Task>("/tasks", { title: title.trim(), area_id: area, status_id: statusId });
      remember(area);
      onCreated(t);
      setTitle("");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={4}>
      <Input
        autoFocus
        size="small"
        placeholder="Title, Enter to add, Esc to close"
        value={title}
        disabled={!online || busy}
        onChange={(e) => setTitle(e.target.value)}
        onPressEnter={submit}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {areas.length > 1 && (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={areaId}
          onChange={setAreaId}
          options={areas.map((a) => ({ value: a.id, label: a.name }))}
        />
      )}
    </Space>
  );
}
