import { useState } from "react";
import { Progress, Tag, Tooltip } from "antd";
import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";
import { DIFFICULTY_LABELS, type CardConfig, type Task } from "../types";
import { TypeIcon } from "../task/TypeIcon";
import { useEpics } from "../task/useEpics";

// A board card. The task key is never shown here — only in the task panel.

export function TaskCard({ task, config, onOpen }: { task: Task; config: CardConfig; onOpen?: () => void }) {
  const { boot, statusById } = useApp();
  const [hover, setHover] = useState(false);
  const { byId: epicsById } = useEpics();
  const epic = task.epic_id ? epicsById.get(task.epic_id) : undefined;
  const show = config.show;
  const area = boot.areas.find((a) => a.id === task.area_id);
  const priority = boot.priorities.find((p) => p.id === task.priority_id);
  const energy = boot.energy_types.find((e) => e.id === task.energy_type_id);
  const status = statusById.get(task.status_id);
  const compact = config.density === "compact";

  const meta: React.ReactNode[] = [];
  if (show.epic && epic)
    meta.push(
      <Lozenge key="epic" color={palette.epic}>
        {epic.title}
      </Lozenge>,
    );
  if (task.type === "epic" && task.epic_tasks)
    meta.push(
      <span key="epicprog" title="Tasks done in this epic">
        {task.epic_done}/{task.epic_tasks} done
      </span>,
    );
  if (show.area && area) meta.push(<Lozenge key="area" color={area.color}>{area.name}</Lozenge>);
  if (show.status && status) meta.push(<Lozenge key="status" color={status.color} strong>{status.name}</Lozenge>);
  if (show.priority && priority) meta.push(<Lozenge key="prio" color={priority.color}>{priority.name}</Lozenge>);
  if (show.energy_type && energy) meta.push(<Lozenge key="energy" color={energy.color}>{energy.name}</Lozenge>);
  if (show.difficulty && task.difficulty)
    meta.push(
      <span key="diff" title={`Difficulty ${task.difficulty} of 5 · ${DIFFICULTY_LABELS[task.difficulty] ?? ""}`}>
        ◆{task.difficulty}
      </span>,
    );
  if (show.estimate && task.estimate_h !== null) meta.push(<span key="est" title="Estimate">{formatHours(task.estimate_h)}</span>);
  if (show.logged && task.logged_h > 0) meta.push(<span key="logged" title="Logged">⏱ {formatHours(task.logged_h)}</span>);
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? palette.hover : palette.panel,
        border: `1px solid ${task.stalled ? palette.danger : "transparent"}`,
        // Jira's raised-card shadow: lifts the card off the sunken column.
        boxShadow: "0 1px 1px #03040480, 0 0 1px #03040480",
        borderLeft: task.type === "epic" ? `3px solid ${palette.epic}` : undefined,
        borderRadius: 6,
        padding: compact ? "6px 8px" : "10px 12px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ lineHeight: 1.35, wordBreak: "break-word", display: "flex", gap: 6 }}>
        <span style={{ flex: "none", paddingTop: 1 }}>
          <TypeIcon type={task.type} />
        </span>
        <span>{task.title}</span>
      </div>
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
