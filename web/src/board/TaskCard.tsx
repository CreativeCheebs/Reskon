import { Progress, Tag, Tooltip } from "antd";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import type { CardConfig, Task } from "../types";

// A board card. The task key is never shown here — only in the task panel.

export function TaskCard({ task, config, onOpen }: { task: Task; config: CardConfig; onOpen?: () => void }) {
  const { boot, statusById } = useApp();
  const show = config.show;
  const area = boot.areas.find((a) => a.id === task.area_id);
  const priority = boot.priorities.find((p) => p.id === task.priority_id);
  const energy = boot.energy_types.find((e) => e.id === task.energy_type_id);
  const status = statusById.get(task.status_id);
  const compact = config.density === "compact";

  const meta: React.ReactNode[] = [];
  if (show.area && area) meta.push(<Tag key="area" color={area.color ?? undefined}>{area.name}</Tag>);
  if (show.status && status) meta.push(<Tag key="status" color={status.color ?? undefined}>{status.name}</Tag>);
  if (show.priority && priority) meta.push(<Tag key="prio" color={priority.color ?? undefined}>{priority.name}</Tag>);
  if (show.energy_type && energy) meta.push(<Tag key="energy" color={energy.color ?? undefined}>{energy.name}</Tag>);
  if (show.difficulty && task.difficulty) meta.push(<span key="diff" title="Difficulty">◆{task.difficulty}</span>);
  if (show.estimate && task.estimate_h !== null) meta.push(<span key="est" title="Estimate">{formatHours(task.estimate_h)}</span>);
  if (show.created_age) meta.push(<span key="cage" title="Created age">c {formatAge(task.created_age_h)}</span>);
  if (show.started_age && task.started_age_h !== null)
    meta.push(<span key="sage" title="Started age">s {formatAge(task.started_age_h)}</span>);
  if (show.time_in_status)
    meta.push(
      <Tooltip key="tis" title={task.stalled ? "Stalled: in this status longer than its alert threshold" : "Time in status"}>
        <span style={{ color: task.stalled ? palette.danger : undefined }}>⧗ {formatAge(task.time_in_status_h)}</span>
      </Tooltip>,
    );
  if (show.due && task.due_at) meta.push(<span key="due" title="Due">due {task.due_at}</span>);
  if (show.subtypes)
    for (const st of task.subtypes) meta.push(<Tag key={"st-" + st} bordered={false}>{st}</Tag>);
  for (const key of show.custom) {
    const field = boot.custom_fields.find((f) => f.entity === "task" && f.key === key);
    const v = task.custom[key];
    if (field && v !== undefined && v !== null && v !== "")
      meta.push(
        <span key={"cf-" + key} title={field.label}>
          {field.label}: {typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}
        </span>,
      );
  }

  const progress = show.progress_bar ? task.progress_pct : null;

  return (
    <div
      onClick={onOpen}
      style={{
        background: palette.panel,
        border: `1px solid ${task.stalled ? palette.danger : palette.border}`,
        borderRadius: 6,
        padding: compact ? "6px 8px" : "10px 12px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ lineHeight: 1.35, wordBreak: "break-word" }}>{task.title}</div>
      {meta.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: compact ? 4 : 8,
            fontSize: 11,
            color: palette.muted,
            alignItems: "center",
          }}
        >
          {meta}
        </div>
      )}
      {progress !== null && (
        <Tooltip title={`${formatHours(task.logged_h)} logged of ${formatHours(task.estimate_h)}`}>
          <Progress percent={progress} size="small" showInfo={false} style={{ margin: "4px 0 0" }} />
        </Tooltip>
      )}
    </div>
  );
}
