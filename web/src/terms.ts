import { useMemo } from "react";
import { useApp } from "./store";

// What the screens call tasks and epics. Settings > Names lets a person use
// their own words ("todo", "story"). Only what is shown changes; the API, the
// database and the spec keep saying task and epic.
//
// The words are kept as typed, in the case wanted mid-sentence ("todo"). The
// capitalised form is for the start of a label or sentence: only the first
// letter is raised, the rest is left alone, so "ToDo" stays "ToDo". Write
// strings so that no "a" or "an" sits in front of a name (say "New task", not
// "Add a task"): which one is right depends on the word.

export interface Terms {
  task: string;
  tasks: string;
  epic: string;
  epics: string;
  Task: string;
  Tasks: string;
  Epic: string;
  Epics: string;
  /** "1 task", "3 tasks". */
  countTasks: (n: number) => string;
  /** "1 epic", "3 epics". */
  countEpics: (n: number) => string;
}

export const DEFAULT_TERMS = { task: "task", tasks: "tasks", epic: "epic", epics: "epics" } as const;
export const MAX_TERM_LENGTH = 24;

export type TermWords = { [K in keyof typeof DEFAULT_TERMS]: string };

/** Raise the first letter, leave the rest as typed. */
export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** A word that is safe to show: text of a sensible length; else null. */
function usable(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= MAX_TERM_LENGTH ? s : null;
}

/** The words set in Settings, with the default for anything missing or odd. */
export function termWords(settings: Record<string, unknown>): TermWords {
  const raw = settings.terms;
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    task: usable(given.task) ?? DEFAULT_TERMS.task,
    tasks: usable(given.tasks) ?? DEFAULT_TERMS.tasks,
    epic: usable(given.epic) ?? DEFAULT_TERMS.epic,
    epics: usable(given.epics) ?? DEFAULT_TERMS.epics,
  };
}

export function makeTerms(w: TermWords): Terms {
  return {
    ...w,
    Task: capitalise(w.task),
    Tasks: capitalise(w.tasks),
    Epic: capitalise(w.epic),
    Epics: capitalise(w.epics),
    countTasks: (n) => `${n} ${n === 1 ? w.task : w.tasks}`,
    countEpics: (n) => `${n} ${n === 1 ? w.epic : w.epics}`,
  };
}

export function useTerms(): Terms {
  const { boot } = useApp();
  const settings = boot.settings;
  return useMemo(() => makeTerms(termWords(settings)), [settings]);
}
