// "Create epic" in the epic picker of the task panel.

/** The value of the picker's extra "Create" option. */
export const CREATE_EPIC = -1;

/**
 * The title to offer "Create epic" for: the typed text, trimmed, when it is
 * not empty and no epic already has exactly that title (ignoring case).
 * Null when nothing should be offered.
 */
export function epicToCreate(typed: string, epics: { title: string }[]): string | null {
  const t = typed.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  return epics.some((e) => e.title.trim().toLowerCase() === lower) ? null : t;
}
