import type { CardConfig, CardShow, View, ViewFilter } from "../types";

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
  due: false,
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
  difficulty: "Difficulty",
  priority: "Priority",
  energy_type: "Energy type",
  subtypes: "Subtypes",
  estimate: "Estimate",
  progress_bar: "Progress bar",
  due: "Due",
  epic: "Epic",
  logged: "Logged time",
};

export function cardConfigOf(view: View): CardConfig {
  const cc = view.card_config ?? {};
  return {
    show: { ...DEFAULT_SHOW, ...(cc.show ?? {}) },
    density: cc.density ?? "compact",
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
  };
}
