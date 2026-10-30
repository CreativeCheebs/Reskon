import { ConfigProvider, Progress, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";
import type { CardConfig, GroupBy, Task } from "../types";
import { TypeIcon } from "../task/TypeIcon";
import { DifficultyIcon, PriorityIcon } from "../task/LevelIcons";
import { useEpics } from "../task/useEpics";
import { groupTasks } from "./grouping";
import { useColumnWidths } from "./useColumnWidths";
import { useSurfaceOpacity, withAlpha } from "./ViewBackdrop";

// Table layout: same filter, columns from the same `show` config as cards.
// Default sort is time in status, descending — the aging list.
// The task key is never a column. Grouped, each group is its own section.

export function TaskTable({
  tasks,
  config,
  groupBy = "none",
  widthsKey,
  onOpenTask,
}: {
  tasks: Task[];
  config: CardConfig;
  groupBy?: GroupBy;
  /** Names this table for its saved column widths, e.g. "view:3". */
  widthsKey: string;
  onOpenTask: (id: number) => void;
}) {
  const { boot, statusById } = useApp();
  const { byId: epics } = useEpics();
  const show = config.show;
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
          title
        ),
    },
  ];
  if (show.epic && groupBy !== "epic")
    cols.push({
      key: "epic",
      title: "Epic",
      width: 180,
      ellipsis: true,
      render: (_, t) => {
        const e = t.epic_id ? epics.get(t.epic_id) : undefined;
        return e ? <span style={{ color: palette.epic }}>{e.title}</span> : null;
      },
      sorter: (a, b) => (epics.get(a.epic_id ?? 0)?.title ?? "~").localeCompare(epics.get(b.epic_id ?? 0)?.title ?? "~"),
    });
  if (show.area)
    cols.push({
      key: "area",
      title: "Area",
      width: 120,
      render: (_, t) => byId(boot.areas, t.area_id)?.name,
      sorter: (a, b) => a.area_id - b.area_id,
    });
  if (show.status)
    cols.push({
      key: "status",
      title: "Status",
      width: 120,
      render: (_, t) => {
        const s = statusById.get(t.status_id);
        return s && <Lozenge color={s.color} strong>{s.name}</Lozenge>;
      },
      sorter: (a, b) => (statusById.get(a.status_id)?.position ?? 0) - (statusById.get(b.status_id)?.position ?? 0),
    });
  if (show.priority)
    cols.push({
      key: "priority",
      title: "Priority",
      width: 90,
      render: (_, t) => {
        const p = byId(boot.priorities, t.priority_id);
        return (
          p && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <PriorityIcon priority={p} all={boot.priorities} tip={false} /> {p.name}
            </span>
          )
        );
      },
      sorter: (a, b) => (byId(boot.priorities, a.priority_id)?.weight ?? 1) - (byId(boot.priorities, b.priority_id)?.weight ?? 1),
    });
  if (show.energy_type)
    cols.push({ key: "energy", title: "Energy", width: 110, render: (_, t) => byId(boot.energy_types, t.energy_type_id)?.name });
  if (show.difficulty)
    cols.push({
      key: "diff",
      title: "Int.",
      width: 60,
      render: (_, t) =>
        t.difficulty && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DifficultyIcon level={t.difficulty} /> {t.difficulty}
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
      width: 110,
      render: (_, t) =>
        t.progress_pct !== null && <Progress percent={Math.round(t.progress_pct)} size="small" />,
    });
  if (show.subtypes)
    cols.push({ key: "subtypes", title: "Subtypes", width: 160, render: (_, t) => t.subtypes.map((s) => <Tag key={s}>{s}</Tag>) });
  if (show.due)
    cols.push({ key: "due", title: "Due", width: 100, dataIndex: "due_at", sorter: (a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "") });
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
  const sized = useColumnWidths<Task>(widthsKey, cols);
  const surface = useSurfaceOpacity();
  // Rows start in aging order even when the column is hidden.
  const rows = [...tasks].sort((a, b) => b.time_in_status_h - a.time_in_status_h);

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
      onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
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

  if (groupBy === "none") return seeThrough(table(rows, true));
  return seeThrough(
    <div style={{ height: "100%", overflow: "auto" }}>
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
