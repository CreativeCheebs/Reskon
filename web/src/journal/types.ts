// Shapes of GET /api/journal. The server makes every total and the Markdown;
// the screens only show them.

export interface JournalSession {
  id: number;
  /** Set when the session is on a task; the task's key is never sent. */
  task_id: number | null;
  /** The task's title, else the session's own label. */
  what: string;
  area: string | null;
  kind: "task" | "event";
  /** Local times, only when the session has a start time. */
  start: string | null;
  end: string | null;
  hours: number;
  /** As typed, with its line breaks. */
  note: string | null;
}

export interface JournalDay {
  day: string;
  hours: number;
  points: number;
  sessions: JournalSession[];
  /** The day written for pasting into a journal. */
  markdown: string;
}

export interface Journal {
  from: string;
  to: string;
  days: JournalDay[];
  /** Older days with sessions were left out at the widget's day limit. */
  more: boolean;
}
