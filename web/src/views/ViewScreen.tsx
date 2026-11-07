import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Dropdown, Input, Segmented, Select, Spin } from "antd";
import { confirm, message } from "../theme/feedback";
import { ControlOutlined, EllipsisOutlined, FilterOutlined, ProjectOutlined, SearchOutlined, TableOutlined } from "@ant-design/icons";
import { LoadError } from "./LoadError";
import { api } from "../api";
import { useApp } from "../store";
import { Board } from "../board/Board";
import { HiddenStatusOverlay } from "../board/HiddenStatusOverlay";
import { TaskPanel } from "../task/TaskPanel";
import { useEpics } from "../task/useEpics";
import { TaskTable } from "./TaskTable";
import { Timeline } from "../timeline/Timeline";
import { SnoozedOverlay } from "./SnoozedOverlay";
import { BlockedOverlay } from "./BlockedOverlay";
import { IncompleteOverlay } from "./IncompleteOverlay";
import { requiredFields } from "../task/completeness";
import { FilterSettings, activeFilterCount } from "./FilterSettings";
import { CardSettings } from "./CardSettings";
import { GROUP_OPTIONS } from "./grouping";
import { useSaveView } from "./useViewState";
import { cardConfigOf } from "./cardConfig";
import type { BoardSort, GroupBy, Task, View } from "../types";
import { SORT_OPTIONS } from "../board/sorting";
import { blend, palette } from "../theme/palette";
import { ViewIconMark } from "../icons/ViewIconMark";
import { SurfaceOpacityProvider, surfaceOpacityOf, ViewBackdrop, withAlpha } from "./ViewBackdrop";
import { lookOf, ViewLookSettings, type ViewLook } from "./ViewLookSettings";
import { ToolbarGroup } from "../theme/Toolbar";
import { LoadingDots, SimilarTasksList, useSimilarTasks } from "../task/SimilarTasks";

// Loads a view's tasks (the server resolves the filter and the search) and
// renders the board or the table, plus the overlays that hang off it.
// Layout and grouping save themselves the moment they change.

export function ViewScreen({ view }: { view: View }) {
  const { boot, reloadKey, online, reloadBootstrap } = useApp();
  const { refresh: refreshEpics } = useEpics();
  const save = useSaveView(view);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStatus, setHiddenStatus] = useState<number | null>(null);
  const [snoozedOpen, setSnoozedOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const panelChanged = useRef(false); // refetch on close only if the open task changed
  const [drawer, setDrawer] = useState<"filter" | "card" | "look" | null>(null);
  const [preview, setPreview] = useState<ViewLook | null>(null); // while the look drawer is open
  const look = preview ?? lookOf(view);
  const surface = surfaceOpacityOf(look.background);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search
  // While the search box has focus, tasks like what is typed from every
  // view (by words and meaning) drop down under it.
  const [searchFocus, setSearchFocus] = useState(false);
  const similar = useSimilarTasks(search, { enabled: searchFocus });

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 150);
    return () => window.clearTimeout(t);
  }, [search]);

  // Only the newest request may change the screen: an older, slower answer
  // (for a view or search the user has already left) must not overwrite it.
  const fetchSeq = useRef(0);
  const refetch = useCallback(() => {
    const seq = ++fetchSeq.current;
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    api
      .get<Task[]>(`/tasks?view=${view.id}${q}`)
      .then((t) => {
        if (seq !== fetchSeq.current) return;
        setTasks(t);
        setError(null);
      })
      // Keep showing the last loaded data, but say it could not be refreshed.
      .catch((e) => {
        if (seq === fetchSeq.current) setError((e as Error).message);
      });
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
  const timeline = !!view.board_state?.timeline;
  const groupOptions = GROUP_OPTIONS.filter((o) => !(view.layout === "board" && o.tableOnly));
  const filters = activeFilterCount(view);
  // Quick switch for the filter's types: everything, tasks only, epics only.
  const types = view.filter?.types ?? [];
  const typeShown = types.length === 1 ? types[0] : "all";
  // Statuses kept off the board (Backlog, Cancelled ...), opened as overlays.
  const hiddenStatuses = boot.statuses.filter((s) => !s.on_board).sort((a, b) => a.position - b.position);
  // Snoozed tasks are hidden from the board, the table and the hidden
  // statuses alike; they are listed under Snoozed until they wake.
  // Blocked tasks likewise go under Blocked, unless the view shows them.
  const hideBlocked = view.board_state?.hide_blocked ?? true;
  const awake = useMemo(() => tasks?.filter((t) => !t.snoozed) ?? null, [tasks]);
  const shown = useMemo(() => (hideBlocked ? awake?.filter((t) => !t.blocked) ?? null : awake), [awake, hideBlocked]);
  const snoozedCount = tasks ? tasks.length - (awake?.length ?? 0) : 0;
  const blockedCount = awake?.filter((t) => t.blocked).length ?? 0;
  // Only once Settings → Complete details requires something can a task
  // be incomplete; until then there is no button.
  const checksDetails = requiredFields(boot.settings).length > 0;
  const incompleteCount = shown?.filter((t) => t.missing.length > 0).length ?? 0;

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
    <SurfaceOpacityProvider value={surface}>
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <ViewBackdrop bg={look.background} />
      {/* Two rows on the board's edges: what this is (title, search, the
          off-board statuses), then how it's shown. Each row wraps by group,
          never inside one. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 12,
          position: "relative",
          // Over an image the toolbar gets a backing so its text stays readable.
          ...(surface < 1 ? { background: withAlpha(palette.bg, Math.max(surface, 0.6)), borderRadius: 6, padding: "6px 8px", margin: "-6px -8px 6px" } : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 16px", minHeight: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "1 1 320px", minWidth: 0 }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: 0,
                fontSize: 18,
                lineHeight: "28px",
                fontWeight: 650,
                letterSpacing: -0.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                // The search gives way, not the title; a long name truncates here.
                flex: "none",
                maxWidth: 320,
              }}
              title={view.name}
            >
              {/* The view's icon on a tint of its colour, like a page badge. */}
              <span
                style={{
                  width: 28,
                  height: 28,
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 7,
                  background: blend(look.color && /^#[0-9a-fA-F]{6}$/.test(look.color) ? look.color : palette.accent, palette.bg, 0.2),
                }}
              >
                {look.icon?.emoji || look.icon?.svg || look.color ? (
                  <ViewIconMark icon={look.icon} color={look.color} size={18} />
                ) : view.layout === "table" ? (
                  <TableOutlined style={{ color: palette.accent, fontSize: 16 }} />
                ) : (
                  <ProjectOutlined style={{ color: palette.accent, fontSize: 16 }} />
                )}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{view.name}</span>
            </h1>
            <div style={{ position: "relative", flex: "0 1 280px", minWidth: 160 }}>
              <Input
                size="small"
                allowClear
                prefix={<SearchOutlined />}
                suffix={similar.loading ? <LoadingDots /> : <span />}
                placeholder="Filter this view: title, key, description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setSearchFocus(false)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              />
              {searchFocus && (
                // mousedown would blur the box and close the list before the click lands.
                <div role="presentation" style={{ position: "absolute", top: "100%", left: 0, width: "max(100%, 420px)", zIndex: 20 }} onMouseDown={(e) => e.preventDefault()}>
                  <SimilarTasksList
                    {...similar}
                    heading="Similar tasks in every view"
                    onOpen={(id) => {
                      setSearchFocus(false);
                      setOpenTask(id);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          {shown && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none", marginLeft: "auto" }}>
              {view.layout === "board" &&
                !timeline &&
                hiddenStatuses.map((s) => (
                  <HiddenStatusButton key={s.id} name={s.name} count={shown.filter((t) => t.status_id === s.id).length} onClick={() => setHiddenStatus(s.id)} />
                ))}
              <HiddenStatusButton name="Snoozed" count={snoozedCount} onClick={() => setSnoozedOpen(true)} />
              {(hideBlocked || blockedCount > 0) && <HiddenStatusButton name="Blocked" count={blockedCount} onClick={() => setBlockedOpen(true)} />}
              {checksDetails && <HiddenStatusButton name="Incomplete" count={incompleteCount} onClick={() => setIncompleteOpen(true)} />}
            </div>
          )}
        </div>
        <div className="jb-toolbar">
          <ToolbarGroup>
            <Segmented
              size="small"
              className="jb-seg"
              aria-label="Layout"
              value={timeline ? "timeline" : view.layout}
              disabled={!online}
              onChange={(v) =>
                v === "timeline" ? save({ board_state: { timeline: true } }) : save({ layout: v as View["layout"], board_state: { timeline: false } })
              }
              options={[
                { value: "board", label: "Board" },
                { value: "table", label: "Table" },
                { value: "timeline", label: "Timeline" },
              ]}
            />
            <Segmented
              size="small"
              className="jb-seg"
              aria-label="Show tasks, epics or both"
              value={typeShown}
              disabled={!online}
              onChange={(v) => save({ filter: { ...view.filter, types: v === "all" ? null : [v as "task" | "epic"] } })}
              options={[
                { value: "all", label: "All" },
                { value: "task", label: "Tasks" },
                { value: "epic", label: "Epics" },
              ]}
            />
          </ToolbarGroup>
          {!timeline && (
            <ToolbarGroup>
              <Select<GroupBy>
                size="small"
                className={groupBy !== "none" ? "jb-active" : undefined}
                style={{ width: 160 }}
                disabled={!online}
                aria-label="Group cards"
                value={groupOptions.some((o) => o.value === groupBy) ? groupBy : "none"}
                onChange={(v) => save({ board_state: { group_by: v } })}
                popupMatchSelectWidth={false}
                options={groupOptions.map((o) => ({ value: o.value, label: o.value === "none" ? o.label : `Group: ${o.label}` }))}
              />
              {view.layout === "board" && (
                <Select<BoardSort>
                  size="small"
                  className={(view.board_state?.sort ?? "manual") !== "manual" ? "jb-active" : undefined}
                  style={{ width: 160 }}
                  disabled={!online}
                  aria-label="Sort cards"
                  value={view.board_state?.sort ?? "manual"}
                  onChange={(v) => save({ board_state: { sort: v } })}
                  popupMatchSelectWidth={false}
                  options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  labelRender={({ value }) => `Sort: ${SORT_OPTIONS.find((o) => o.value === value)?.label.split(",")[0]}`}
                />
              )}
            </ToolbarGroup>
          )}
          <ToolbarGroup right>
            <Badge count={filters} size="small" color={palette.accent} offset={[-2, 2]}>
              <Button size="small" icon={<FilterOutlined />} className={filters ? "jb-active" : undefined} onClick={() => setDrawer("filter")}>
                Filter
              </Button>
            </Badge>
            <Button size="small" icon={<ControlOutlined />} onClick={() => setDrawer("card")}>
              {view.layout === "board" ? "Card" : "Columns"}
            </Button>
            <Dropdown
              trigger={["click"]}
              disabled={!online}
              menu={{
                items: [
                  { key: "rename", label: "Rename view" },
                  { key: "look", label: "Icon and background…" },
                  { key: "delete", label: "Delete view", danger: true },
                ],
                onClick: ({ key }) => (key === "rename" ? rename() : key === "look" ? setDrawer("look") : remove()),
              }}
            >
              <Button size="small" aria-label="View menu" icon={<EllipsisOutlined />} />
            </Dropdown>
          </ToolbarGroup>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {error && shown && online && <LoadError message={error} onRetry={refetch} stale />}
        {!shown ? (
          error ? (
            <LoadError message={error} onRetry={refetch} />
          ) : (
            <Spin />
          )
        ) : timeline ? (
          <Timeline
            tasks={shown}
            zoom={view.board_state?.timeline_zoom ?? "months"}
            onZoom={(z) => save({ board_state: { timeline_zoom: z } })}
            onOpenTask={setOpenTask}
          />
        ) : view.layout === "board" ? (
          <Board view={view} tasks={shown} setTasks={update} refetch={refetch} onOpenTask={setOpenTask} />
        ) : (
          <TaskTable
            tasks={shown}
            config={cardConfigOf(view)}
            groupBy={groupBy}
            widthsKey={`view:${view.id}`}
            onOpenTask={setOpenTask}
            onMoved={(moved) => {
              // A move can take tasks out of this view's filter.
              update((prev) => prev.map((t) => moved.find((m) => m.id === t.id) ?? t));
              refetch();
            }}
          />
        )}
      </div>
      {shown && hiddenStatus !== null && (
        <HiddenStatusOverlay statusId={hiddenStatus} tasks={shown} onClose={() => setHiddenStatus(null)} onMoved={replace} onOpenTask={setOpenTask} />
      )}
      {shown && incompleteOpen && <IncompleteOverlay tasks={shown} onClose={() => setIncompleteOpen(false)} onOpenTask={setOpenTask} />}
      {awake && blockedOpen && (
        <BlockedOverlay
          tasks={awake}
          hidden={hideBlocked}
          onHidden={(hide) => save({ board_state: { hide_blocked: hide } })}
          onClose={() => setBlockedOpen(false)}
          onOpenTask={setOpenTask}
        />
      )}
      {tasks && snoozedOpen && <SnoozedOverlay tasks={tasks} onClose={() => setSnoozedOpen(false)} onChanged={replace} onOpenTask={setOpenTask} />}
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
      {drawer === "look" && <ViewLookSettings view={view} onPreview={setPreview} onClose={() => setDrawer(null)} />}
    </div>
    </SurfaceOpacityProvider>
  );
}

/** A status kept off the board (Backlog, Cancelled ...) with its count;
 *  quieter than the toolbar, opens the status as an overlay. */
// An outlined button, so it reads as something to click; none at zero,
// since an empty list has nothing to open.
function HiddenStatusButton({ name, count, onClick }: { name: string; count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <Button size="small" onClick={onClick} aria-label={`${name}: ${count} tasks`} style={{ color: palette.muted, paddingInline: 8, gap: 6 }}>
      {name}
      <span
        style={{
          minWidth: 18,
          height: 16,
          padding: "0 5px",
          borderRadius: 8,
          background: palette.hover,
          color: palette.fg,
          fontSize: 11,
          lineHeight: "16px",
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        {count}
      </span>
    </Button>
  );
}
