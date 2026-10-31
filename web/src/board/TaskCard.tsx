import { useApp } from "../store";
import { formatAge, formatHours } from "../format";
import { blend, palette } from "../theme/palette";
import { Chip } from "../theme/Chip";
import { Lozenge } from "../theme/Lozenge";
import { DIFFICULTY_LABELS, type CardConfig, type Task } from "../types";
import { TypeIcon } from "../task/TypeIcon";
import { DifficultyIcon, PriorityIcon, priorityColor } from "../task/LevelIcons";
import { useEpics } from "../task/useEpics";
import { TimeBar } from "../task/TimeBar";

// A board card, title first. Under it: labels (epic, area ...), then the
// signals as tinted chips (priority, intensity, time in status, due), then
// quieter figures as plain text, then the time bar. Each row wraps on its
// own. The status is never shown — the column says it — and neither is the
// task key, which lives only in the task panel. A coloured edge appears only
// when the card needs attention: stalled (red) or overdue (amber).

export function TaskCard({ task, config, onOpen }: { task: Task; config: CardConfig; onOpen?: () => void }) {
  const { boot } = useApp();
  const { byId: epicsById } = useEpics();
  const epic = task.epic_id ? epicsById.get(task.epic_id) : undefined;
  const show = config.show;
  const area = boot.areas.find((a) => a.id === task.area_id);
  const priority = boot.priorities.find((p) => p.id === task.priority_id);
  const energy = boot.energy_types.find((e) => e.id === task.energy_type_id);
  const compact = config.density === "compact";
  const overdue = task.days_to_due !== null && task.days_to_due < 0;

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

  const chips: React.ReactNode[] = [];
  if (show.priority && priority)
    chips.push(
      <Chip
        key="prio"
        color={priorityColor(priority, boot.priorities)}
        icon={<PriorityIcon priority={priority} all={boot.priorities} size={12} tip={false} />}
        tip={`Priority: ${priority.name}`}
      >
        {priority.name}
      </Chip>,
    );
  if (show.difficulty && task.difficulty)
    chips.push(
      <Chip
        key="diff"
        color={palette[`difficulty${task.difficulty}` as "difficulty1"]}
        icon={<DifficultyIcon level={task.difficulty} size={12} tip={false} />}
        tip={`Intensity ${task.difficulty} of 5 · ${DIFFICULTY_LABELS[task.difficulty]}`}
      >
        {task.difficulty}
      </Chip>,
    );
  if (task.type === "epic" && task.epic_tasks)
    chips.push(
      <Chip key="epicprog" color={palette.epic} tip="Tasks done in this epic">
        {task.epic_done}/{task.epic_tasks} done
      </Chip>,
    );
  if (show.time_in_status)
    chips.push(
      <Chip
        key="tis"
        color={task.stalled ? palette.danger : null}
        tip={task.stalled ? "Stalled: in this status longer than its alert threshold" : "Time in this status"}
      >
        {task.stalled ? "Stalled" : "⧗"} {formatAge(task.time_in_status_h)}
      </Chip>,
    );
  // Overdue always says so, since it is what the card's amber edge means.
  if ((show.due || overdue) && task.due_at)
    chips.push(
      <Chip key="due" color={overdue ? palette.warn : null} tip={`Due ${task.due_at}`}>
        {overdue ? "Overdue" : "Due"} {shortDate(task.due_at)}
      </Chip>,
    );

  const details: React.ReactNode[] = [];
  // The time bar already says both, so neither is repeated beside it.
  const bar = show.progress_bar && task.progress_pct !== null;
  if (show.estimate && task.estimate_h !== null && !bar) details.push(<span key="est" title="Estimate">{formatHours(task.estimate_h)} est.</span>);
  if (show.logged && task.logged_h > 0 && !bar) details.push(<span key="logged" title="Logged">⏱ {formatHours(task.logged_h)}</span>);
  if (show.created_age) details.push(<span key="cage" title="Created age">created {formatAge(task.created_age_h)}</span>);
  if (show.started_age && task.started_age_h !== null)
    details.push(<span key="sage" title="Started age">started {formatAge(task.started_age_h)}</span>);
  if (show.start_date && task.start_date) details.push(<span key="start" title="Start date">start {shortDate(task.start_date)}</span>);
  if (show.end_date && task.end_date) details.push(<span key="end" title="End date">end {shortDate(task.end_date)}</span>);
  for (const key of show.custom) {
    const field = boot.custom_fields.find((f) => f.entity === "task" && f.key === key);
    const v = task.custom[key];
    if (field && v !== undefined && v !== null && v !== "")
      details.push(
        <span key={"cf-" + key} title={field.label}>
          {field.label}: {typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}
        </span>,
      );
  }

  const edge = task.stalled ? palette.danger : overdue ? palette.warn : null;
  const row = { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 4 };

  return (
    <div
      onClick={onOpen}
      className={onOpen ? "jb-card jb-clickable" : "jb-card"}
      style={{
        border: `1px solid ${blend(palette.border, palette.panel, 0.55)}`,
        boxShadow: `0 1px 2px ${palette.shadow}66${edge ? `, inset 3px 0 0 ${edge}` : ""}`,
        borderRadius: 8,
        padding: compact ? "9px 11px 10px" : "12px 13px",
        cursor: onOpen ? "pointer" : "grabbing",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 7 : 9,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ flex: "none", display: "flex", height: 19, alignItems: "center" }}>
          <TypeIcon type={task.type} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: "19px", fontWeight: 500, color: palette.fg, overflowWrap: "anywhere" }}>
          {task.title}
        </span>
      </div>
      {labels.length > 0 && <div style={row}>{labels}</div>}
      {chips.length > 0 && <div style={row}>{chips}</div>}
      {details.length > 0 && (
        <div style={{ ...row, gap: "2px 10px", fontSize: 11, lineHeight: "16px", color: palette.subtle, whiteSpace: "nowrap" }}>{details}</div>
      )}
      {bar && <TimeBar task={task} pace={show.pace} />}
    </div>
  );
}

/** "3 Nov" for a YYYY-MM-DD date; the year only when it isn't this one. */
function shortDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
