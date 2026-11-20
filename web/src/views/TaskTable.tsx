import { useCallback, useRef, useState } from "react";
import { ConfigProvider, Table, Tag, Typography } from "antd";
import { TimeBar } from "../task/TimeBar";
import type { ColumnsType } from "antd/es/table";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";
import type { CardConfig, GroupBy, Task } from "../types";
import type { NextMode } from "../task/nextTask";
import { TaskTitle } from "../task/RoundTag";
import { TypeIcon } from "../task/TypeIcon";
import { DifficultyIcon, PriorityIcon } from "../task/LevelIcons";
import { useEpics } from "../task/useEpics";
import { groupTasks } from "./grouping";
import { useColumnWidths } from "./useColumnWidths";
import { useSurfaceOpacity, withAlpha } from "./ViewBackdrop";
import { TaskBulkBar } from "./TaskBulkBar";
import { checkboxLabel } from "../a11y";
import { useTerms } from "../terms";
import { cardActionsOf } from "../board/CardActions";
import { RowMenu } from "./RowMenu";
import { StatusPicker } from "./StatusPicker";
import { useTags } from "../tags/tags";

// Table layout: same filter, columns from the same `show` config as cards.
// Default sort is time in status, descending — the aging list.
// The task key is never a column. Grouped, each group is its own section.
// With onMoved, rows can be ticked (a group's header box ticks the group)
// and moved to another status together.

/** The narrowest the title column gets before the table scrolls sideways. */
const TITLE_MIN = 240;

export function TaskTable({
  tasks,
  config,
  groupBy = "none",
  widthsKey,
  onOpenTask,
  onMoved,
  onDeleted,
  sticky = true,
  bulkZIndex,
  extraColumn,
}: {
  tasks: Task[];
  config: CardConfig;
  groupBy?: GroupBy;
  /** Names this table for its saved column widths, e.g. "view:3". */
  widthsKey: string;
  onOpenTask: (id: number, next?: NextMode) => void;
  /** Turns on row selection, the status button and the right-click menu;
   *  called with the tasks a move changed. */
  onMoved?: (tasks: Task[]) => void;
  /** Called with the ids of the tasks deleted from a row menu or the bulk bar. */
  onDeleted?: (ids: number[]) => void;
  /** The header stays in view while the page scrolls. Off inside a pop-up. */
  sticky?: boolean;
  /** Raises the bulk bar above a pop-up this table sits in. */
  bulkZIndex?: number;
  /** One more column at the end, such as a row's own button. */
  extraColumn?: ColumnsType<Task>[number];
}) {
  const { boot, statusById } = useApp();
  const T = useTerms();
  const { namesOf } = useTags();
  const { byId: epics } = useEpics();
  const show = config.show;
  const iconsOnly = config.icons_only;
  const byId = <T extends { id: number }>(rows: T[], id: number | null) => rows.find((r) => r.id === id);
  const num = (a: number | null, b: number | null) => (a ?? -Infinity) - (b ?? -Infinity);
  // An epic's row shows the time logged against its tasks.
  const loggedOf = (t: Task) => (t.type === "epic" ? t.epic_logged_h ?? 0 : t.logged_h);

  const cols: ColumnsType<Task> = [
    {
      key: "type",
      title: "",
      width: 34,
      render: (_, t) => <TypeIcon type={t.type} />,
      sorter: (a, b) => a.type.localeCompare(b.type),
    },
    {
      key: "title",
      title: "Title",
      dataIndex: "title",
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title, t) =>
        t.type === "epic" && t.epic_tasks ? (
          <span>
            {title} <span style={{ color: palette.muted, fontSize: 11 }}>{t.epic_done}/{t.epic_tasks} done</span>
          </span>
        ) : (
          <TaskTitle task={t} />
        ),
    },
  ];
  if (show.epic && groupBy !== "epic")
    cols.push({
      key: "epic",
      title: T.Epic,
      width: 180,
      ellipsis: true,
      render: (_, t) => {
        const e = t.epic_id ? epics.get(t.epic_id) : undefined;
        return e ? <span style={{ color: palette.epic }}>{e.title}</span> : null;
      },
      sorter: (a, b) => (epics.get(a.epic_id ?? 0)?.title ?? "~").localeCompare(epics.get(b.epic_id ?? 0)?.title ?? "~"),
    });
  if (show.tags)
    cols.push({
      key: "tags",
      title: "Tags",
      width: 160,
      render: (_, t) => namesOf(t.tag_ids).map((n) => <Tag key={n}>{n}</Tag>),
    });
  if (show.area)
    cols.push({
      key: "area",
      title: "Area",
      width: 120,
      render: (_, t) => byId(boot.areas, t.area_id)?.name,
      sorter: (a, b) => (byId(boot.areas, a.area_id)?.name ?? "").localeCompare(byId(boot.areas, b.area_id)?.name ?? ""),
    });
  if (show.status)
    cols.push({
      key: "status",
      title: "Status",
      width: 120,
      render: (_, t) => {
        const s = statusById.get(t.status_id);
        if (!s) return null;
        // With moves on, the status is a button listing the statuses.
        return onMoved ? <StatusPicker task={t} onMoved={(m) => onMoved([m])} /> : <Lozenge color={s.color} strong>{s.name}</Lozenge>;
      },
      sorter: (a, b) => (statusById.get(a.status_id)?.position ?? 0) - (statusById.get(b.status_id)?.position ?? 0),
    });
  if (show.priority)
    cols.push({
      key: "priority",
      title: iconsOnly ? "Pri." : "Priority",
      width: iconsOnly ? 54 : 90,
      render: (_, t) => {
        const p = byId(boot.priorities, t.priority_id);
        if (!p) return null;
        if (iconsOnly) return <PriorityIcon priority={p} all={boot.priorities} />;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <PriorityIcon priority={p} all={boot.priorities} tip={false} /> {p.name}
          </span>
        );
      },
      sorter: (a, b) => (byId(boot.priorities, a.priority_id)?.weight ?? 1) - (byId(boot.priorities, b.priority_id)?.weight ?? 1),
    });
  if (show.energy_type)
    cols.push({ key: "energy", title: "Energy", width: 110, render: (_, t) => byId(boot.energy_types, t.energy_type_id)?.name });
  if (show.difficulty)
    cols.push({
      key: "diff",
      title: "Level",
      width: iconsOnly ? 48 : 90,
      render: (_, t) =>
        t.difficulty &&
        (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DifficultyIcon level={t.difficulty} tip={false} decorative /> {t.difficulty}
          </span>
        ),
      sorter: (a, b) => num(a.difficulty, b.difficulty),
    });
  if (show.estimate)
    cols.push({
      key: "est",
      title: "Est",
      width: 70,
      render: (_, t) => formatHours(t.estimate_h),
      sorter: (a, b) => num(a.estimate_h, b.estimate_h),
    });
  if (show.logged)
    cols.push({
      key: "logged",
      title: "Logged",
      width: 80,
      render: (_, t) => formatHours(loggedOf(t)),
      sorter: (a, b) => loggedOf(a) - loggedOf(b),
    });
  if (show.progress_bar)
    cols.push({
      key: "progress",
      title: "Progress",
      width: 190,
      render: (_, t) => <TimeBar task={t} pace={show.pace} />,
      sorter: (a, b) => (a.remaining_h ?? Infinity) - (b.remaining_h ?? Infinity),
    });
  if (show.subtypes)
    cols.push({ key: "subtypes", title: "Subtypes", width: 160, render: (_, t) => t.subtypes.map((s) => <Tag key={s}>{s}</Tag>) });
  if (show.due)
    cols.push({ key: "due", title: "Due", width: 100, dataIndex: "due_at", sorter: (a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "") });
  for (const [k, title] of [
    ["start_date", "Start"],
    ["end_date", "End"],
  ] as const)
    if (show[k])
      cols.push({ key: k, title, width: 100, dataIndex: k, sorter: (a, b) => (a[k] ?? "").localeCompare(b[k] ?? "") });
  if (show.created_age)
    cols.push({
      key: "created",
      title: "Created",
      width: 80,
      render: (_, t) => formatAge(t.created_age_h),
      sorter: (a, b) => a.created_age_h - b.created_age_h,
    });
  if (show.started_age)
    cols.push({
      key: "started",
      title: "Started",
      width: 80,
      render: (_, t) => formatAge(t.started_age_h),
      sorter: (a, b) => num(a.started_age_h, b.started_age_h),
    });
  for (const key of show.custom) {
    const field = boot.custom_fields.find((f) => f.entity === "task" && f.key === key);
    if (!field) continue;
    cols.push({
      key: "cf-" + key,
      title: field.label,
      width: 120,
      render: (_, t) => {
        const v = t.custom[key];
        return typeof v === "boolean" ? (v ? "yes" : "no") : v === undefined || v === null ? "" : String(v);
      },
      sorter: (a, b) => String(a.custom[key] ?? "").localeCompare(String(b.custom[key] ?? "")),
    });
  }
  if (show.time_in_status)
    cols.push({
      key: "tis",
      title: "In status",
      width: 90,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.time_in_status_h - b.time_in_status_h,
      render: (_, t) => (
        <span style={{ color: t.stalled ? palette.danger : undefined }}>{formatAge(t.time_in_status_h)}</span>
      ),
    });
  if (extraColumn) cols.push(extraColumn);
  const sized = useColumnWidths<Task>(widthsKey, cols);
  // The title column has no set width: it takes what the others leave. With
  // many columns in a narrow space (a pop-up) that came to nothing and the
  // title wrapped one letter per line. The table is made at least wide enough
  // for the title to keep TITLE_MIN, and scrolls sideways when it is wider.
  const scrollX = sized.columns.reduce((sum, c) => sum + (typeof c.width === "number" ? c.width : 0), onMoved ? 36 : 0) + TITLE_MIN;
  const surface = useSurfaceOpacity();
  // Rows start in aging order even when the column is hidden.
  const rows = [...tasks].sort((a, b) => b.time_in_status_h - a.time_in_status_h);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // The row whose right-click menu is open, and where.
  // Kept by id so the menu always works on the task as it is now, and by a
  // number so only the menu that asked to close is closed.
  const [menu, setMenu] = useState<{ id: number; seq: number; x: number; y: number } | null>(null);
  const menuSeq = useRef(0);
  const lastRow = useRef(0);
  const closeMenu = useCallback((seq: number) => {
    setMenu((m) => (m && m.seq === seq ? null : m));
    // Give the keyboard back to the row the menu came from.
    window.setTimeout(() => {
      if (document.activeElement === document.body || document.activeElement === null) {
        document.querySelector<HTMLElement>(`tr[data-row-key="${lastRow.current}"]`)?.focus();
      }
    }, 0);
  }, []);
  // Settings > Card actions lists nothing for the menu: the browser's own then.
  // Snooze is only offered for open tasks, so it can leave a task nothing.
  const menuKeys = cardActionsOf(boot.settings).menu;
  const hasMenu = (t: Task) => menuKeys.some((k) => k !== "snooze" || t.behaviour === "todo" || t.behaviour === "in_progress");
  // Only rows still shown count, so a filter change never moves hidden tasks.
  const selected = rows.filter((t) => picked.has(t.id)).map((t) => t.id);

  const table = (data: Task[], sticky: boolean) => (
    <Table<Task>
      size="small"
      rowKey="id"
      dataSource={data}
      columns={sized.columns}
      components={sized.components}
      pagination={false}
      sticky={sticky}
      tableLayout="fixed"
      scroll={{ x: scrollX }}
      rowSelection={
        onMoved && {
          columnWidth: 36,
          getCheckboxProps: (t) => checkboxLabel(`Select ${t.title}`),
          selectedRowKeys: data.filter((t) => picked.has(t.id)).map((t) => t.id),
          onChange: (keys) =>
            setPicked((sel) => {
              const next = new Set([...sel].filter((id) => !data.some((t) => t.id === id)));
              keys.forEach((k) => next.add(Number(k)));
              return next;
            }),
        }
      }
      onRow={(t) => ({
        // A click on the tick box selects the row; anywhere else opens it.
        onClick: (e) => {
          // React sends events from pop-ups drawn elsewhere (a status list, a menu) up to the row too: ignore those.
          if (!e.currentTarget.contains(e.target as Node)) return;
          if (!(e.target as HTMLElement).closest(".ant-table-selection-column")) onOpenTask(t.id);
        },
        onContextMenu: (e) => {
          if (!e.currentTarget.contains(e.target as Node)) return;
          if (!onMoved || !hasMenu(t)) return;
          e.preventDefault();
          // The keyboard's menu key sends no pointer position: use the row.
          const at = e.clientX === 0 && e.clientY === 0 ? (e.currentTarget as HTMLElement).getBoundingClientRect() : null;
          lastRow.current = t.id;
          setMenu({ id: t.id, seq: ++menuSeq.current, x: at ? at.left + 24 : e.clientX, y: at ? at.top + at.height / 2 : e.clientY });
        },
        style: { cursor: "pointer" },
        // The same from the keyboard: Tab to a row, Enter or Space opens it.
        tabIndex: 0,
        onKeyDown: (e) => {
          // Escape closes the menu, not a pop-up (the Backlog list) this table is in.
          if (e.key === "Escape" && menu) {
            e.stopPropagation();
            setMenu(null);
          }
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpenTask(t.id);
          }
        },
      })}
    />
  );
  const bar = onMoved && selected.length > 0 && (
    <TaskBulkBar
      zIndex={bulkZIndex}
      tasks={rows.filter((t) => picked.has(t.id))}
      onDeleted={(ids) => {
        setPicked(new Set());
        onDeleted?.(ids);
      }}
      ids={selected}
      total={rows.length}
      onSelectAll={() => setPicked(new Set(rows.map((t) => t.id)))}
      onClear={() => setPicked(new Set())}
      onMoved={(moved) => {
        setPicked(new Set());
        onMoved(moved);
      }}
    />
  );

  const menuTask = menu ? rows.find((t) => t.id === menu.id) : undefined;
  const rowMenu = menu && menuTask && onMoved && (
    <RowMenu
      key={menu.seq}
      task={menuTask}
      x={menu.x}
      y={menu.y}
      onDone={() => closeMenu(menu.seq)}
      handlers={{
        onOpen: onOpenTask,
        onChanged: (t) => onMoved([t]),
        onDeleted: (id) => {
          setPicked((sel) => new Set([...sel].filter((x) => x !== id)));
          onDeleted?.([id]);
        },
      }}
    />
  );

  // Over a view's background image the table lets it show through.
  const seeThrough = (node: React.ReactNode) =>
    surface >= 1 ? (
      node
    ) : (
      <ConfigProvider
        theme={{
          components: {
            Table: {
              colorBgContainer: withAlpha(palette.panel, surface),
              headerBg: withAlpha(palette.panel, Math.min(1, surface + 0.1)),
              rowHoverBg: withAlpha(palette.hover, Math.min(1, surface + 0.1)),
            },
          },
        }}
      >
        {node}
      </ConfigProvider>
    );

  if (groupBy === "none")
    return seeThrough(
      <>
        {table(rows, sticky)}
        {bar}
        {rowMenu}
      </>,
    );
  return seeThrough(
    <div style={{ height: "100%", overflow: "auto" }}>
      {bar}
      {rowMenu}
      {groupTasks(rows, groupBy, boot, epics).map((g) => (
        <section key={g.key} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 6px" }}>
            {g.epic && <TypeIcon type="epic" />}
            <Typography.Text strong>{g.label}</Typography.Text>
            <span style={{ color: palette.muted, fontSize: 12 }}>{g.tasks.length}</span>
          </div>
          {table(g.tasks, false)}
        </section>
      ))}
    </div>,
  );
}
