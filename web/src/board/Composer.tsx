import { useState } from "react";
import { Button, Input, Select, Space, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { local, WriteButton } from "../offline";
import { filterOf } from "../views/cardConfig";
import type { Task, TaskType, View } from "../types";
import { TypeIcon } from "../task/TypeIcon";
import { useEpics } from "../task/useEpics";
import { today } from "../format";

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
export function Composer({
  statusId,
  view,
  defaults = {},
  onCreated,
  open: openProp,
  onOpenChange,
}: {
  statusId: number;
  view: View;
  /** From the swimlane it sits in, e.g. {epic_id} or {priority_id}. */
  defaults?: Record<string, unknown>;
  onCreated: (t: Task) => void;
  /** Optional control from outside, e.g. a column's empty state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { online } = useApp();
  const { refresh: refreshEpics } = useEpics();
  const [type, setType] = useState<TaskType>((defaults.type as TaskType) ?? "task");
  const { areas, preselect, remember } = useAreaChoice(view);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState<number | undefined>(preselect);
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <WriteButton type="text" size="small" block className="jb-add-task" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ justifyContent: "flex-start" }}>
        Add task
      </WriteButton>
    );

  const submit = async () => {
    const area = (defaults.area_id as number | undefined) ?? (areas.length === 1 ? areas[0].id : areaId);
    if (!title.trim() || !area) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...defaults, title: title.trim(), area_id: area, status_id: statusId, type, today: today() };
      if (type === "epic") delete body.epic_id; // an epic cannot sit in an epic
      const t = await api.post<Task>("/tasks", body);
      remember(area);
      if (type === "epic") refreshEpics();
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
        prefix={
          <Tooltip title={type === "epic" ? "Creating an epic (click for task)" : "Creating a task (click for epic)"}>
            <Button
              type="text"
              size="small"
              style={{ padding: 0, height: 18, width: 18, minWidth: 18 }}
              onClick={() => setType(type === "epic" ? "task" : "epic")}
              aria-label="Toggle task or epic"
            >
              <TypeIcon type={type} />
            </Button>
          </Tooltip>
        }
        placeholder="Title, Enter to add, Esc to close"
        value={title}
        disabled={!online || busy}
        onChange={(e) => setTitle(e.target.value)}
        onPressEnter={submit}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {areas.length > 1 && defaults.area_id === undefined && (
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
