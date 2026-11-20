// Shapes returned by the API. Derived fields are computed server-side and
// only ever displayed here, never recomputed.

export type Behaviour = "todo" | "in_progress" | "done" | "cancelled";

export interface StatusCategory {
  id: number;
  name: string;
  behaviour: Behaviour;
  is_builtin: boolean;
}

export interface Status {
  id: number;
  name: string;
  category_id: number;
  color: string | null;
  on_board: boolean;
  alert_after_days: number | null;
  is_builtin: boolean;
  position: number;
}

export interface Priority {
  id: number;
  name: string;
  color: string | null;
  weight: number;
  position: number;
  is_builtin: boolean;
}

export interface EnergyType {
  id: number;
  name: string;
  color: string | null;
  position: number;
  points_per_hour: number;
}

export interface Subtype {
  id: number;
  name: string;
  energy_type_id: number;
  position: number;
}

export interface Area {
  id: number;
  name: string;
  key_prefix: string;
  color: string | null;
  default_energy_type_id: number | null;
  position: number;
}

/** A tag, with how many tasks and sessions carry it. */
export interface Tag {
  id: number;
  name: string;
  task_count: number;
  session_count: number;
}

/** A tag on a session: from its task (it follows the task), or put on by hand. */
export interface SessionTag {
  tag_id: number;
  from_task: boolean;
}

export interface ViewFilter {
  areas: number[] | null;
  statuses: number[] | null;
  difficulty_min: number | null;
  custom: Record<string, unknown> | null;
  include_done_days: number | null;
  open_only?: boolean;
  types?: TaskType[] | null;
  epics?: number[] | null; // 0 = tasks with no epic
  tags?: number[] | null; // tasks with any of these tags; 0 = tasks with no tags
  /** Show subtasks as their own cards; they are left out when false. */
  subtasks?: boolean;
  /** Lists above that mean "is not": tasks matching any chosen value are left out. */
  not?: NotField[] | null;
}

/** Lists in a view's filter that can read "is not". */
export type NotField = "areas" | "statuses" | "types" | "epics" | "tags";

export type TaskType = "task" | "epic";

export type GroupBy = "none" | "epic" | "priority" | "area" | "energy_type" | "difficulty" | "type" | "status";

export type BoardSort = "manual" | "priority" | "due" | "difficulty" | "estimate" | "time_in_status" | "newest" | "oldest";

/** UI state saved on the view as you use it. */
export interface BoardState {
  collapsed?: number[]; // status ids
  group_by?: GroupBy;
  /** Card order within each board column; absent means manual. */
  sort?: BoardSort;
  /** Column limits by status id. */
  limits?: Record<string, ColumnLimit>;
  /** Blocked tasks go under the Blocked button instead of the board; absent means true. */
  hide_blocked?: boolean;
  /** Shows the timeline instead of the layout (view.layout allows only board and table). */
  timeline?: boolean;
  timeline_zoom?: "weeks" | "months" | "quarters";
}

export interface ColumnLimit {
  max: number;
  unit: "tasks" | "points" | "hours";
  /** Hard: asks before a card is moved in past it. Soft: only shows it. */
  hard: boolean;
}

export interface CardShow {
  area: boolean;
  status: boolean;
  created_age: boolean;
  started_age: boolean;
  time_in_status: boolean;
  difficulty: boolean;
  priority: boolean;
  energy_type: boolean;
  subtypes: boolean;
  estimate: boolean;
  progress_bar: boolean;
  /** Under the time bar: hours a day needed to finish by the due date. */
  pace: boolean;
  due: boolean;
  start_date: boolean;
  end_date: boolean;
  epic: boolean;
  tags: boolean;
  logged: boolean;
  custom: string[];
}

export interface CardConfig {
  show: CardShow;
  density: "compact" | "comfortable";
  /** Tables: priority and intensity as symbols only, without their names. */
  icons_only: boolean;
}

export interface View {
  id: number;
  name: string;
  layout: "board" | "table";
  filter: Partial<ViewFilter>;
  card_config: Partial<CardConfig>;
  board_state: BoardState;
  position: number;
  icon: ViewIcon;
  color: string | null;
  background: ViewBackground;
}

/** An emoji, or an SVG icon from a bundled set (its body kept inline). */
export type ViewIcon = { emoji?: string; set?: string; name?: string; svg?: string };

export type ImageFit = "cover" | "contain" | "stretch";

export interface ViewBackground {
  image_id?: number;
  fit?: ImageFit;
  /** Of the image, 0-1. */
  opacity?: number;
  /** px */
  blur?: number;
  /** How solid columns and tables are over the image, 0-1. */
  surface_opacity?: number;
}

export type FieldType = "text" | "int" | "real" | "date" | "bool" | "select";

export interface CustomField {
  id: number;
  entity: "task" | "session";
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  position: number;
}

export interface Bootstrap {
  areas: Area[];
  statuses: Status[];
  status_categories: StatusCategory[];
  priorities: Priority[];
  energy_types: EnergyType[];
  subtypes: Subtype[];
  views: View[];
  custom_fields: CustomField[];
  tags: Tag[];
  settings: Record<string, unknown>;
}

/** GET /api/tasks?brief=1: just enough for a task picker. */
export interface TaskBrief {
  id: number;
  key: string;
  title: string;
  type: "task" | "epic";
  area_id: number;
  energy_type_id: number | null;
  difficulty: number | null;
  behaviour: Behaviour;
  parent_id: number | null;
  tag_ids: number[];
}

export interface Task {
  id: number;
  /** Its tags, by tag id, in the order of their names. */
  tag_ids: number[];
  key: string;
  title: string;
  description: string | null;
  area_id: number;
  status_id: number;
  priority_id: number | null;
  energy_type_id: number | null;
  difficulty: number | null;
  estimate_h: number | null;
  due_at: string | null;
  /** Local dates, set by hand or filled in by a move (Settings → Task dates). */
  start_date: string | null;
  end_date: string | null;
  /** Local date a snoozed task shows again; set only by POST /tasks/:id/snooze. */
  snoozed_until: string | null;
  type: TaskType;
  epic_id: number | null;
  /** Set on a subtask: the task it belongs to. */
  parent_id: number | null;
  /** Hidden while an open task blocks it; set only by POST /tasks/:id/snooze. */
  snooze_until_unblocked: boolean;
  /** The task this one continues; set only by POST /tasks/:id/continue. */
  follows_id: number | null;
  /** Rounds (SPEC 4.17): the first round of its series, its number (never
   *  changed) and whether the series counts rounds (#3) or versions (v3). */
  round_of: number | null;
  round_no: number | null;
  round_kind: RoundKind | null;
  board_pos: number;
  custom: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // derived
  behaviour: Behaviour;
  first_started_at: string | null;
  last_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  last_moved_at: string;
  created_age_h: number;
  started_age_h: number | null;
  time_in_status_h: number;
  stalled: boolean;
  points: number | null;
  logged_h: number;
  /** logged_h plus the hours on its subtasks. */
  logged_total_h: number;
  /** Past 100 once more is logged than estimated. */
  progress_pct: number | null;
  remaining_h: number | null;
  days_to_due: number | null;
  pace_h: number | null;
  /** Open and snoozed_until is still ahead: hidden from boards and tables. */
  snoozed: boolean;
  /** Fields Settings → Complete details requires that this open task lacks. */
  missing: string[];
  subtypes: string[];
  epic_tasks: number | null; // epics only
  epic_done: number | null;
  epic_estimate_h: number | null; // summed estimates of its tasks
  epic_logged_h: number | null; // hours logged against its tasks
  subtask_count: number; // its subtasks, cancelled left out
  subtask_done: number;
  /** An open task blocks it. */
  blocked: boolean;
  blocked_by: LinkedTask[];
  blocks: LinkedTask[];
  /** The task this one continues ("comes after"), and the tasks that continue it ("next"). */
  follows: LinkedTask | null;
  followed_by: LinkedTask[];
  /** Every round of its series, oldest first; filled only by GET /tasks/:id. */
  rounds: Round[];
}

export type RoundKind = "round" | "version";

/** One round of a series, as the task panel lists it. */
export interface Round {
  id: number;
  key: string;
  title: string;
  no: number;
  behaviour: Behaviour;
  completed_at: string | null;
  logged_h: number;
  points: number;
}

/** The other end of a dependency link. */
export interface LinkedTask {
  link_id: number;
  id: number;
  key: string;
  title: string;
  status_id: number;
  behaviour: Behaviour;
  round_no?: number | null; // its round, if it has one (SPEC 4.17)
  round_kind?: RoundKind | null;
}

export interface Transition {
  id: number;
  task_id: number;
  from_status_id: number | null;
  to_status_id: number;
  reason: string;
  at: string;
}

export interface Segment {
  status_id: number;
  from: string;
  to: string;
  hours: number;
  current: boolean;
}

export interface SessionSubtype {
  subtype_id: number;
  rank: number;
  weight: number;
  weighted_h: number;
}

/** One energy type of a session. A one-type session has one, at share 1. */
export interface SessionEnergy {
  energy_type_id: number;
  /** Part of the session's hours, 0..1; a session's shares add up to 1. */
  share: number;
  difficulty: number | null;
  points: number | null;
  /** Derived: session hours x share. */
  hours: number;
}

export interface Session {
  id: number;
  task_id: number | null;
  label: string | null;
  area_id: number | null;
  kind: "task" | "event";
  energy_type_id: number;
  hours: number;
  /** Stored when logged (hours x the type's rate x difficulty). */
  points: number | null;
  /** Derived: what the session would earn at today's rates. */
  points_now: number | null;
  difficulty: number | null;
  started_at: string | null;
  logged_for: string;
  note: string | null;
  custom: Record<string, unknown>;
  created_at: string;
  subtypes: SessionSubtype[];
  energies: SessionEnergy[];
  /** Its task's tags as they are now (from_task), then the ones put on by hand. */
  tags: SessionTag[];
}

export interface CaptureParse {
  intent: "session" | "task" | null;
  kind: "task" | "event" | null;
  title: string | null;
  energy_type: string | null;
  hours: number | null;
  difficulty: number | null;
  subtypes: string[] | null;
  /** Tags that already exist; capture never makes one. */
  tags?: string[] | null;
  area: string | null;
  matched_task_key: string | null;
  confidence: number | null;
  matched_task_id?: number | null;
  fallback?: boolean;
  fallback_reason?: string;
  /** Several energy types in one activity; shares are percents adding up to 100. */
  energies?: { energy_type: string; share: number; difficulty: number | null }[] | null;
  /** Every entry in the line, the first being the fields above. */
  entries?: CaptureParse[];
}

/** The level (stored as difficulty) is 1-5: how much it took, for work, rest or play alike.
 *  It is only a number: no word says one level is "more" than another. */
export const levelName = (n: number): string => `Level ${n}`;
