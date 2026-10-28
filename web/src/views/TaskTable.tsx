import { Progress, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import type { CardConfig, Task } from "../types";

// Table layout: same filter, columns from the same `show` config as cards.
// Default sort is time in status, descending — the aging list.
// The task key is never a column.

export function TaskTable({
  tasks,
  config,
  onOpenTask,
}: {
  tasks: Task[];
  config: CardConfig;
  onOpenTask: (id: number) => void;
}) {
  const { boot, statusById } = useApp();
  const show = config.show;
  const byId = <T extends { id: number }>(rows: T[], id: number | null) => rows.find((r) => r.id === id);
  const num = (a: number | null, b: number | null) => (a ?? -Infinity) - (b ?? -Infinity);

  const cols: ColumnsType<Task> = [
    { title: "Title", dataIndex: "title", sorter: (a, b) => a.title.localeCompare(b.title) },
  ];
  if (show.area)
    cols.push({
      title: "Area",
      width: 120,
      render: (_, t) => byId(boot.areas, t.area_id)?.name,
      sorter: (a, b) => a.area_id - b.area_id,
    });
  if (show.status)
    cols.push({
      title: "Status",
      width: 120,
      render: (_, t) => {
        const s = statusById.get(t.status_id);
        return s && <Tag color={s.color ?? undefined}>{s.name}</Tag>;
      },
      sorter: (a, b) => (statusById.get(a.status_id)?.position ?? 0) - (statusById.get(b.status_id)?.position ?? 0),
    });
  if (show.priority)
    cols.push({
      title: "Priority",
      width: 90,
      render: (_, t) => {
        const p = byId(boot.priorities, t.priority_id);
        return p && <Tag color={p.color ?? undefined}>{p.name}</Tag>;
      },
      sorter: (a, b) => (byId(boot.priorities, a.priority_id)?.weight ?? 1) - (byId(boot.priorities, b.priority_id)?.weight ?? 1),
    });
  if (show.energy_type)
    cols.push({ title: "Energy", width: 110, render: (_, t) => byId(boot.energy_types, t.energy_type_id)?.name });
  if (show.difficulty)
    cols.push({ title: "Diff", width: 60, dataIndex: "difficulty", sorter: (a, b) => num(a.difficulty, b.difficulty) });
  if (show.estimate)
    cols.push({
      title: "Est",
      width: 70,
      render: (_, t) => formatHours(t.estimate_h),
      sorter: (a, b) => num(a.estimate_h, b.estimate_h),
    });
  if (show.progress_bar)
    cols.push({
      title: "Progress",
      width: 110,
      render: (_, t) =>
        t.progress_pct !== null && <Progress percent={Math.round(t.progress_pct)} size="small" />,
    });
  if (show.subtypes)
    cols.push({ title: "Subtypes", render: (_, t) => t.subtypes.map((s) => <Tag key={s}>{s}</Tag>) });
  if (show.due)
    cols.push({ title: "Due", width: 100, dataIndex: "due_at", sorter: (a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "") });
  if (show.created_age)
    cols.push({
      title: "Created",
      width: 80,
      render: (_, t) => formatAge(t.created_age_h),
      sorter: (a, b) => a.created_age_h - b.created_age_h,
    });
  if (show.started_age)
    cols.push({
      title: "Started",
      width: 80,
      render: (_, t) => formatAge(t.started_age_h),
      sorter: (a, b) => num(a.started_age_h, b.started_age_h),
    });
  for (const key of show.custom) {
    const field = boot.custom_fields.find((f) => f.entity === "task" && f.key === key);
    if (!field) continue;
    cols.push({
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
      title: "In status",
      width: 90,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.time_in_status_h - b.time_in_status_h,
      render: (_, t) => (
        <span style={{ color: t.stalled ? palette.danger : undefined }}>{formatAge(t.time_in_status_h)}</span>
      ),
    });
  // Rows start in aging order even when the column is hidden.
  const rows = [...tasks].sort((a, b) => b.time_in_status_h - a.time_in_status_h);

  return (
    <Table<Task>
      size="small"
      rowKey="id"
      dataSource={rows}
      columns={cols}
      pagination={false}
      sticky
      onRow={(t) => ({ onClick: () => onOpenTask(t.id), style: { cursor: "pointer" } })}
    />
  );
}
