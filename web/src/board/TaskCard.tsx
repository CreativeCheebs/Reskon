import { useState } from "react";
import { Tooltip } from "antd";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";
import type { CardConfig, Task } from "../types";
import { TypeIcon } from "../task/TypeIcon";
import { DifficultyIcon, PriorityIcon } from "../task/LevelIcons";
import { useEpics } from "../task/useEpics";

// A board card: the title, then a row of labels, then a row of quieter
// details led by the priority and difficulty symbols. Each row wraps on its
// own, so an estimate never ends up alone under a label. The status is never shown — the column says
// it. The task key is never shown here either, only in the task panel.

export function TaskCard({ task, config, onOpen }: { task: Task; config: CardConfig; onOpen?: () => void }) {
  const { boot } = useApp();
  const [hover, setHover] = useState(false);
  const { byId: epicsById } = useEpics();
  const epic = task.epic_id ? epicsById.get(task.epic_id) : undefined;
  const show = config.show;
  const area = boot.areas.find((a) => a.id === task.area_id);
  const priority = boot.priorities.find((p) => p.id === task.priority_id);
  const energy = boot.energy_types.find((e) => e.id === task.energy_type_id);
  const compact = config.density === "compact";

  const labels: React.ReactNode[] = [];
  if (show.epic && epic)
    labels.push(
      <Lozenge key="epic" color={palette.epic}>
        {epic.title}
      </Lozenge>,
    );
  if (show.area && area) labels.push(<Lozenge key="area" color={area.color}>{area.name}</Lozenge>);
  if (show.energy_type && energy) labels.push(<Lozenge key="energy" color={energy.color}>{energy.name}</Lozenge>);
  if (show.subtypes) for (const st of task.subtypes) labels.push(<Lozenge key={"st-" + st}>{st}</Lozenge>);

  const stats: React.ReactNode[] = [];
  if (show.priority && priority) stats.push(<PriorityIcon key="prio" priority={priority} all={boot.priorities} />);
  if (show.difficulty && task.difficulty) stats.push(<DifficultyIcon key="diff" level={task.difficulty} />);
  if (task.type === "epic" && task.epic_tasks)
    stats.push(
      <span key="epicprog" title="Tasks done in this epic">
        {task.epic_done}/{task.epic_tasks} done
      </span>,
    );
  if (show.estimate && task.estimate_h !== null) stats.push(<span key="est" title="Estimate">{formatHours(task.estimate_h)}</span>);
  if (show.logged && task.logged_h > 0) stats.push(<span key="logged" title="Logged">⏱ {formatHours(task.logged_h)}</span>);
  if (show.created_age) stats.push(<span key="cage" title="Created age">c {formatAge(task.created_age_h)}</span>);
  if (show.started_age && task.started_age_h !== null)
    stats.push(<span key="sage" title="Started age">s {formatAge(task.started_age_h)}</span>);
  if (show.time_in_status)
    stats.push(
      <Tooltip key="tis" title={task.stalled ? "Stalled: in this status longer than its alert threshold" : "Time in status"}>
        <span style={{ color: task.stalled ? palette.danger : undefined }}>⧗ {formatAge(task.time_in_status_h)}</span>
      </Tooltip>,
    );
  if (show.due && task.due_at) stats.push(<span key="due" title="Due">due {task.due_at}</span>);
  for (const key of show.custom) {
    const field = boot.custom_fields.find((f) => f.entity === "task" && f.key === key);
    const v = task.custom[key];
    if (field && v !== undefined && v !== null && v !== "")
      stats.push(
        <span key={"cf-" + key} title={field.label}>
          {field.label}: {typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}
        </span>,
      );
  }

  const progress = show.progress_bar ? task.progress_pct : null;
  const gap = compact ? 6 : 8;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? palette.hover : palette.panel,
        border: `1px solid ${task.stalled ? palette.danger : "transparent"}`,
        // Jira's raised-card shadow: lifts the card off the sunken column.
        boxShadow: `0 1px 1px ${palette.shadow}80, 0 0 1px ${palette.shadow}80`,
        borderRadius: 6,
        padding: compact ? "8px 10px" : "12px 12px",
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ flex: "none", display: "flex", height: 18, alignItems: "center" }}>
          <TypeIcon type={task.type} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", fontWeight: 500, color: palette.fg, overflowWrap: "anywhere" }}>
          {task.title}
        </span>
      </div>
      {labels.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{labels}</div>}
      {stats.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "2px 10px",
            fontSize: 11,
            lineHeight: "16px",
            color: palette.subtle,
            whiteSpace: "nowrap",
          }}
        >
          {stats}
        </div>
      )}
      {progress !== null && (
        <Tooltip title={`${formatHours(task.logged_h)} logged of ${formatHours(task.estimate_h)}`}>
          <div style={{ height: 3, borderRadius: 2, background: palette.border, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, progress)}%`, height: "100%", background: palette.accent }} />
          </div>
        </Tooltip>
      )}
    </div>
  );
}
