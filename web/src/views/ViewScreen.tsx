import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Dropdown, Input, Segmented, Select, Spin } from "antd";
import { confirm, message } from "../theme/feedback";
import { SearchOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { Board } from "../board/Board";
import { HiddenStatusOverlay } from "../board/HiddenStatusOverlay";
import { TaskPanel } from "../task/TaskPanel";
import { useEpics } from "../task/useEpics";
import { TaskTable } from "./TaskTable";
import { FilterSettings, activeFilterCount } from "./FilterSettings";
import { CardSettings } from "./CardSettings";
import { GROUP_OPTIONS } from "./grouping";
import { useSaveView } from "./useViewState";
import { cardConfigOf } from "./cardConfig";
import type { GroupBy, Task, View } from "../types";
import { palette } from "../theme/palette";

// Loads a view's tasks (the server resolves the filter and the search) and
// renders the board or the table, plus the overlays that hang off it.
// Layout and grouping save themselves the moment they change.

export function ViewScreen({ view }: { view: View }) {
  const { reloadKey, online, reloadBootstrap } = useApp();
  const { refresh: refreshEpics } = useEpics();
  const save = useSaveView(view);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStatus, setHiddenStatus] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const panelChanged = useRef(false); // refetch on close only if the open task changed
  const [drawer, setDrawer] = useState<"filter" | "card" | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 150);
    return () => window.clearTimeout(t);
  }, [search]);

  const refetch = useCallback(() => {
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    api
      .get<Task[]>(`/tasks?view=${view.id}${q}`)
      .then((t) => {
        setTasks(t);
        setError(null);
      })
      // Offline: keep showing the last loaded data.
      .catch((e) => setError((e as Error).message));
  }, [view.id, query]);

  // Saving layout or grouping hands back a new view object with an equal
  // filter; only a real filter change needs the tasks again.
  const filterKey = JSON.stringify(view.filter);
  useEffect(() => {
    refetch();
  }, [reloadKey, filterKey, refetch]);

  // Stable, so the memoised board skips re-rendering when only a panel or
  // drawer opens.
  const update = useCallback((fn: (prev: Task[]) => Task[]) => setTasks((prev) => fn(prev ?? [])), []);
  const replace = useCallback((t: Task) => update((prev) => prev.map((x) => (x.id === t.id ? t : x))), [update]);
  const groupBy: GroupBy = view.board_state?.group_by ?? "none";
  const groupOptions = GROUP_OPTIONS.filter((o) => !(view.layout === "board" && o.tableOnly));
  const filters = activeFilterCount(view);

  const rename = () => {
    let name = view.name;
    confirm({
      title: "Rename view",
      icon: null,
      content: <Input defaultValue={view.name} autoFocus onChange={(e) => (name = e.target.value)} />,
      onOk: () => name.trim() && save({ name: name.trim() }),
    });
  };
  const remove = () =>
    confirm({
      title: `Delete the view “${view.name}”?`,
      content: "Only the view is deleted; its tasks stay.",
      okButtonProps: { danger: true },
      okText: "Delete",
      onOk: async () => {
        try {
          await api.del(`/views/${view.id}`);
          window.location.hash = "";
          await reloadBootstrap();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginRight: 4 }}>{view.name}</div>
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search title, key, description"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
        />
        <div style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={view.layout}
          disabled={!online}
          onChange={(v) => save({ layout: v as View["layout"] })}
          options={[
            { value: "board", label: "Board" },
            { value: "table", label: "Table" },
          ]}
        />
        <Select<GroupBy>
          size="small"
          style={{ width: 160 }}
          disabled={!online}
          value={groupOptions.some((o) => o.value === groupBy) ? groupBy : "none"}
          onChange={(v) => save({ board_state: { group_by: v } })}
          options={groupOptions.map((o) => ({ value: o.value, label: o.value === "none" ? o.label : `Group: ${o.label}` }))}
        />
        <Badge count={filters} size="small" color={palette.accent}>
          <Button size="small" onClick={() => setDrawer("filter")}>
            Filter
          </Button>
        </Badge>
        <Button size="small" onClick={() => setDrawer("card")}>
          {view.layout === "board" ? "Card" : "Columns"}
        </Button>
        <Dropdown
          trigger={["click"]}
          disabled={!online}
          menu={{
            items: [
              { key: "rename", label: "Rename view" },
              { key: "delete", label: "Delete view", danger: true },
            ],
            onClick: ({ key }) => (key === "rename" ? rename() : remove()),
          }}
        >
          <Button size="small" aria-label="View menu">
            ⋯
          </Button>
        </Dropdown>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {!tasks ? (
          error ? (
            <Alert type="error" message={error} />
          ) : (
            <Spin />
          )
        ) : view.layout === "board" ? (
          <Board view={view} tasks={tasks} setTasks={update} refetch={refetch} onOpenTask={setOpenTask} onOpenHidden={setHiddenStatus} />
        ) : (
          <TaskTable tasks={tasks} config={cardConfigOf(view)} groupBy={groupBy} onOpenTask={setOpenTask} />
        )}
      </div>
      {tasks && hiddenStatus !== null && (
        <HiddenStatusOverlay statusId={hiddenStatus} tasks={tasks} onClose={() => setHiddenStatus(null)} onMoved={replace} onOpenTask={setOpenTask} />
      )}
      {openTask !== null && (
        <TaskPanel
          taskId={openTask}
          initial={tasks?.find((t) => t.id === openTask)}
          onClose={() => {
            setOpenTask(null);
            // An edit may have taken the task out of this view's filter, or
            // changed an epic's progress.
            if (panelChanged.current) {
              panelChanged.current = false;
              refetch();
              refreshEpics();
            }
          }}
          onChanged={(t) => {
            panelChanged.current = true;
            replace(t);
          }}
          onDeleted={(id) => {
            panelChanged.current = true;
            update((prev) => prev.filter((t) => t.id !== id));
          }}
        />
      )}
      {drawer === "filter" && <FilterSettings view={view} onClose={() => setDrawer(null)} />}
      {drawer === "card" && <CardSettings view={view} sample={tasks?.find((t) => t.type === "task")} onClose={() => setDrawer(null)} />}
    </div>
  );
}
