import type { CardConfig, CardShow, View, ViewFilter } from "../types";
import type { Terms } from "../terms";

// Defaults for a view whose stored JSON leaves keys out. Matches the spec's
// example card configuration.
export const DEFAULT_SHOW: CardShow = {
  area: false,
  status: false,
  created_age: false,
  started_age: false,
  time_in_status: true,
  difficulty: true,
  priority: true,
  energy_type: false,
  subtypes: true,
  estimate: true,
  progress_bar: true,
  pace: true,
  due: false,
  start_date: false,
  end_date: false,
  epic: true,
  logged: false,
  custom: [],
};

export const SHOW_LABELS: Record<Exclude<keyof CardShow, "custom">, string> = {
  area: "Area",
  status: "Status",
  created_age: "Created age",
  started_age: "Started age",
  time_in_status: "Time in status",
  difficulty: "Level",
  priority: "Priority",
  energy_type: "Energy type",
  subtypes: "Subtypes",
  estimate: "Estimate",
  progress_bar: "Time bar (logged / estimate)",
  pace: "Hours a day to the due date",
  due: "Due",
  start_date: "Start date",
  end_date: "End date",
  epic: "Epic",
  logged: "Logged time",
};

/** The labels with the epic's own name in the list. */
export const showLabelsFor = (T: Terms) => ({ ...SHOW_LABELS, epic: T.Epic });

export function cardConfigOf(view: View): CardConfig {
  const cc = view.card_config ?? {};
  return {
    show: { ...DEFAULT_SHOW, ...(cc.show ?? {}) },
    density: cc.density ?? "compact",
    icons_only: cc.icons_only ?? false,
  };
}

export function filterOf(view: View): ViewFilter {
  const f = view.filter ?? {};
  return {
    areas: f.areas ?? null,
    statuses: f.statuses ?? null,
    difficulty_min: f.difficulty_min ?? null,
    custom: f.custom ?? null,
    include_done_days: f.include_done_days ?? null,
    open_only: f.open_only ?? false,
    types: f.types ?? null,
    epics: f.epics ?? null,
    subtasks: f.subtasks ?? false,
  };
}
